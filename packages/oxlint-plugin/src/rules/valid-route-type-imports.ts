import { basename, extname } from "node:path";

import { defineRule } from "@oxlint/plugins";
import type { Context, ESTree, Settings } from "@oxlint/plugins";
import { NEAREST_OUTLET_CONTEXT_TYPE, toolkitTypesSpecifier } from "react-router-toolkit";

import type { ReactRouterToolkitSettings, RouteModuleInfo } from "../settings";
import { readSettings } from "../settings";
import { getRuleDocsURL } from "../utils";

type MessageIds =
  | "wrongReactRouterTypeImport"
  | "missingReactRouterTypeImport"
  | "wrongToolkitTypeImport"
  | "missingToolkitTypeImport";

interface GeneratedTypeImportDescriptor {
  sourcePrefix: string;
  exportedName: string;
  wrongMessageId: MessageIds;
  missingMessageId: MessageIds;
  expectedSpecifier: (physicalFile: string) => string;
}

const REACT_ROUTER_ROUTE_TYPE = "Route";

const GENERATED_TYPE_IMPORTS: readonly GeneratedTypeImportDescriptor[] = [
  {
    sourcePrefix: "./+types/",
    exportedName: REACT_ROUTER_ROUTE_TYPE,
    wrongMessageId: "wrongReactRouterTypeImport",
    missingMessageId: "missingReactRouterTypeImport",
    expectedSpecifier: reactRouterTypesSpecifier,
  },
  {
    sourcePrefix: "./+toolkit-types/",
    exportedName: NEAREST_OUTLET_CONTEXT_TYPE,
    wrongMessageId: "wrongToolkitTypeImport",
    missingMessageId: "missingToolkitTypeImport",
    expectedSpecifier: toolkitTypesSpecifier,
  },
];

const validRouteTypeImports = defineRule({
  meta: {
    type: "problem",
    fixable: "code",
    docs: {
      description:
        "Ensure generated route type imports in route modules point at that same route module's generated React Router and react-router-toolkit type files.",
      url: getRuleDocsURL("valid-route-type-imports"),
    },
    messages: {
      wrongReactRouterTypeImport:
        "React Router route types must be imported from this route module's generated `{{expected}}` module.",
      missingReactRouterTypeImport:
        "Import React Router route types from this route module's generated `{{expected}}` module.",
      wrongToolkitTypeImport:
        "react-router-toolkit route types must be imported from this route module's generated `{{expected}}` module.",
      missingToolkitTypeImport:
        "Import react-router-toolkit route types from this route module's generated `{{expected}}` module.",
    } satisfies Record<MessageIds, string>,
  },
  createOnce: (context) => {
    let settingsSource: Readonly<Settings> | undefined;
    let settings: ReactRouterToolkitSettings | null = null;
    let entriesByFile = new Map<string, RouteModuleInfo[]>();

    let selfEntries: RouteModuleInfo[] = [];
    let lastImport: ESTree.ImportDeclaration | null = null;
    let importedFromExpected = new Set<string>();
    let knownNames = new Set<string>();
    let usedReactRouterRouteType = false;
    let usedToolkitType = false;
    let wrongImports: {
      node: ESTree.ImportDeclaration;
      descriptor: GeneratedTypeImportDescriptor;
      expected: string;
    }[] = [];

    return {
      before: () => {
        selfEntries = [];
        lastImport = null;
        importedFromExpected = new Set();
        knownNames = new Set();
        usedReactRouterRouteType = false;
        usedToolkitType = false;
        wrongImports = [];

        if (context.settings !== settingsSource) {
          settingsSource = context.settings;
          settings = readSettings(context.settings);
          entriesByFile = new Map();
          if (settings !== null) {
            for (const entry of Object.values(settings.routeModules)) {
              const entries = entriesByFile.get(entry.physicalFile);
              if (entries === undefined) {
                entriesByFile.set(entry.physicalFile, [entry]);
              } else {
                entries.push(entry);
              }
            }
          }
        }
        if (settings === null) {
          return false;
        }
        selfEntries = entriesByFile.get(context.physicalFilename) ?? [];
        if (selfEntries.length === 0) {
          return false;
        }
        const text = context.sourceCode.text;
        return (
          text.includes("+types/") ||
          text.includes("+toolkit-types/") ||
          text.includes("Route.") ||
          text.includes(NEAREST_OUTLET_CONTEXT_TYPE)
        );
      },

      ImportDeclaration: (node) => {
        lastImport = node;
        const source = node.source.value;
        for (const specifier of node.specifiers) {
          knownNames.add(specifier.local.name);
        }
        if (typeof source !== "string") {
          return;
        }

        for (const descriptor of GENERATED_TYPE_IMPORTS) {
          if (!source.startsWith(descriptor.sourcePrefix)) {
            continue;
          }
          const expected = descriptor.expectedSpecifier(selfEntries[0]!.physicalFile);
          if (importsExportedName(node, descriptor.exportedName) && source === expected) {
            importedFromExpected.add(descriptor.exportedName);
          }
          if (source !== expected) {
            wrongImports.push({ node, descriptor, expected });
          }
        }
      },

      TSTypeAliasDeclaration: (node) => {
        knownNames.add(node.id.name);
      },

      TSInterfaceDeclaration: (node) => {
        knownNames.add(node.id.name);
      },

      FunctionDeclaration: (node) => {
        if (node.id !== null) {
          knownNames.add(node.id.name);
        }
      },

      ClassDeclaration: (node) => {
        if (node.id !== null) {
          knownNames.add(node.id.name);
        }
      },

      TSTypeReference: (node) => {
        if (isRouteNamespaceType(node.typeName)) {
          usedReactRouterRouteType = true;
        } else if (node.typeName.type === "Identifier") {
          if (node.typeName.name === NEAREST_OUTLET_CONTEXT_TYPE) {
            usedToolkitType = true;
          }
        }
      },

      "Program:exit": () => {
        if (selfEntries.length === 0) {
          return;
        }
        for (const { node, descriptor, expected } of wrongImports) {
          context.report({
            node: node.source,
            messageId: descriptor.wrongMessageId,
            data: { expected },
            fix: (fixer) => fixer.replaceTextRange(node.source.range, JSON.stringify(expected)),
          });
        }

        reportMissingImports(context, {
          lastImport,
          knownNames,
          importedFromExpected,
          used: new Map<string, boolean>([
            [REACT_ROUTER_ROUTE_TYPE, usedReactRouterRouteType],
            [NEAREST_OUTLET_CONTEXT_TYPE, usedToolkitType],
          ]),
          physicalFile: selfEntries[0]!.physicalFile,
        });
      },
    };
  },
});

function reportMissingImports(
  context: Context,
  options: {
    lastImport: ESTree.ImportDeclaration | null;
    knownNames: ReadonlySet<string>;
    importedFromExpected: ReadonlySet<string>;
    used: ReadonlyMap<string, boolean>;
    physicalFile: string;
  },
): void {
  const missing = GENERATED_TYPE_IMPORTS.filter(
    (descriptor) =>
      options.used.get(descriptor.exportedName) === true &&
      !options.importedFromExpected.has(descriptor.exportedName) &&
      !options.knownNames.has(descriptor.exportedName),
  );
  if (missing.length === 0) {
    return;
  }

  const statements = missing
    .map((descriptor) => {
      const expected = descriptor.expectedSpecifier(options.physicalFile);
      return `import type { ${descriptor.exportedName} } from ${JSON.stringify(expected)};`;
    })
    .join("\n");
  const insertText = options.lastImport === null ? `${statements}\n` : `\n${statements}`;

  missing.forEach((descriptor, index) => {
    const expected = descriptor.expectedSpecifier(options.physicalFile);
    context.report({
      loc: { line: 1, column: 0 },
      messageId: descriptor.missingMessageId,
      data: { expected },
      fix:
        index === 0
          ? (fixer) =>
              options.lastImport === null
                ? fixer.insertTextBeforeRange([0, 0], insertText)
                : fixer.insertTextAfterRange(options.lastImport.range, insertText)
          : undefined,
    });
  });
}

function importsExportedName(node: ESTree.ImportDeclaration, exportedName: string): boolean {
  return node.specifiers.some(
    (specifier) =>
      specifier.type === "ImportSpecifier" &&
      specifier.imported.type === "Identifier" &&
      specifier.imported.name === exportedName &&
      specifier.local.name === exportedName,
  );
}

function isRouteNamespaceType(typeName: ESTree.TSTypeReference["typeName"]): boolean {
  if (typeName.type !== "TSQualifiedName") {
    return false;
  }
  let left = typeName.left;
  while (left.type === "TSQualifiedName") {
    left = left.left;
  }
  return left.type === "Identifier" && left.name === REACT_ROUTER_ROUTE_TYPE;
}

function reactRouterTypesSpecifier(physicalFile: string): string {
  return `./+types/${basename(physicalFile, extname(physicalFile))}`;
}

export default validRouteTypeImports;
