import { dirname, relative as relativePath } from "node:path";

import { defineRule } from "@oxlint/plugins";
import type { Context, ESTree, Settings } from "@oxlint/plugins";

import type { ReactRouterToolkitSettings, RouteModuleInfo } from "../settings";
import { readSettings } from "../settings";
import { getRuleDocsURL } from "../utils";

type MessageIds =
  // Parent role: a route renders `<Outlet context={...}>`.
  | "missingOutletContextAnnotation"
  | "useSatisfiesNotAs"
  | "inlineOutletContextType"
  | "outletContextTypeNotLocal"
  | "outletContextTypeNotExported"
  | "outletSpreadAttribute"
  // Child role: a route calls `useOutletContext()`.
  | "missingOutletContextType"
  | "outdatedOutletContextType"
  | "ambiguousParentOutletContext"
  | "parentOutletPassesNoContext";

const typeSafeOutletContext = defineRule({
  meta: {
    type: "suggestion",
    fixable: "code",
    docs: {
      description:
        "Keep outlet context types in sync without writing them twice: require `<Outlet context={...}>` to be annotated with `satisfies <ExportedType>`, and auto-fill the matching `useOutletContext<T>()` type argument (and its import) in descendant routes.",
      url: getRuleDocsURL("type-safe-outlet-context"),
    },
    messages: {
      missingOutletContextAnnotation:
        "Annotate the outlet context with `satisfies <ExportedType>` so descendant routes can reuse the type.",
      useSatisfiesNotAs: "Use `satisfies` instead of `as` for the outlet context type.",
      inlineOutletContextType:
        "Extract the outlet context type into an exported type alias in this module and reference it with `satisfies`.",
      outletSpreadAttribute:
        "Do not spread attributes onto <Outlet>; pass `context` explicitly with `satisfies <ExportedType>` so descendant routes can infer it.",
      outletContextTypeNotLocal:
        'Type "{{name}}" must be a type alias defined in this module so descendant routes can import it from here.',
      outletContextTypeNotExported:
        'Type "{{name}}" must be exported so descendant routes can import it.',
      missingOutletContextType:
        "useOutletContext() should be typed as `{{expected}}` from the parent outlet context.",
      outdatedOutletContextType:
        "useOutletContext type argument should be `{{expected}}` to match the parent outlet context.",
      ambiguousParentOutletContext:
        "The parent layout passes outlet context with differing types; annotate useOutletContext manually.",
      parentOutletPassesNoContext:
        "The nearest layout renders <Outlet> without context, so useOutletContext() is always undefined here.",
    } satisfies Record<MessageIds, string>,
  },
  createOnce: (context) => {
    let settingsSource: Readonly<Settings> | undefined;
    let settings: ReactRouterToolkitSettings | null = null;

    // Resolved per file in `before()`.
    let selfInfo: RouteModuleInfo | undefined;
    let parentInfo: RouteModuleInfo | undefined;

    // Parent role: collected from this file's own AST.
    let outletDirectNames = new Set<string>();
    let outletNamespaceNames = new Set<string>();
    let localTypeAliases = new Map<string, ESTree.TSTypeAliasDeclaration>();
    let exportedNames = new Set<string>();
    let contextProps: { attr: ESTree.JSXAttribute; expr: ESTree.Expression | null }[] = [];
    let outletSpreads: ESTree.JSXSpreadAttribute[] = [];

    // Child role.
    let useOutletContextNames = new Set<string>();
    let knownNames = new Set<string>();
    let calls: ESTree.CallExpression[] = [];
    let lastImport: ESTree.ImportDeclaration | null = null;

    return {
      before: () => {
        selfInfo = undefined;
        parentInfo = undefined;
        outletDirectNames = new Set();
        outletNamespaceNames = new Set();
        localTypeAliases = new Map();
        exportedNames = new Set();
        contextProps = [];
        outletSpreads = [];
        useOutletContextNames = new Set();
        knownNames = new Set();
        calls = [];
        lastImport = null;

        if (context.settings !== settingsSource) {
          settingsSource = context.settings;
          settings = readSettings(context.settings);
        }
        if (settings === null || settings.routeModules === undefined) {
          return false;
        }
        const routeModules = settings.routeModules;
        selfInfo = Object.values(routeModules).find(
          (entry) => entry.physicalFile === context.physicalFilename,
        );
        if (selfInfo === undefined) {
          return false;
        }
        parentInfo = selfInfo.parentId === undefined ? undefined : routeModules[selfInfo.parentId];
        return true;
      },

      ImportDeclaration: (node) => {
        lastImport = node;
        const source = node.source.value;
        for (const specifier of node.specifiers) {
          knownNames.add(specifier.local.name);
          if (specifier.type === "ImportNamespaceSpecifier") {
            if (source === "react-router" || source === "react-router-dom") {
              outletNamespaceNames.add(specifier.local.name);
            }
          } else if (
            specifier.type === "ImportSpecifier" &&
            specifier.imported.type === "Identifier"
          ) {
            if (
              (source === "react-router" || source === "react-router-dom") &&
              specifier.imported.name === "Outlet"
            ) {
              outletDirectNames.add(specifier.local.name);
            }
            if (
              (source === "react-router" || source === "react-router-dom") &&
              specifier.imported.name === "useOutletContext"
            ) {
              useOutletContextNames.add(specifier.local.name);
            }
          }
        }
      },

      TSTypeAliasDeclaration: (node) => {
        knownNames.add(node.id.name);
        localTypeAliases.set(node.id.name, node);
        if (node.parent.type === "ExportNamedDeclaration") {
          exportedNames.add(node.id.name);
        }
      },

      TSInterfaceDeclaration: (node) => {
        knownNames.add(node.id.name);
      },

      ExportNamedDeclaration: (node) => {
        for (const specifier of node.specifiers) {
          if (specifier.local.type === "Identifier") {
            exportedNames.add(specifier.local.name);
          }
        }
      },

      JSXOpeningElement: (node) => {
        if (!isOutletName(node.name, outletDirectNames, outletNamespaceNames)) {
          return;
        }
        for (const attribute of node.attributes) {
          if (attribute.type === "JSXSpreadAttribute") {
            outletSpreads.push(attribute);
            continue;
          }
          if (attribute.name.type !== "JSXIdentifier" || attribute.name.name !== "context") {
            continue;
          }
          const value = attribute.value;
          const expr =
            value !== null &&
            value.type === "JSXExpressionContainer" &&
            value.expression.type !== "JSXEmptyExpression"
              ? value.expression
              : null;
          contextProps.push({ attr: attribute, expr });
        }
      },

      CallExpression: (node) => {
        if (node.callee.type === "Identifier" && useOutletContextNames.has(node.callee.name)) {
          calls.push(node);
        }
      },

      "Program:exit": () => {
        if (selfInfo === undefined) {
          return;
        }
        reportParentRole(context, contextProps, outletSpreads, localTypeAliases, exportedNames);
        reportChildRole(context, parentInfo, calls, knownNames, lastImport);
      },
    };
  },
});

// Parent role is report-only: any outlet context that is not `satisfies <local exported type
// alias>` is an error the developer must fix by hand. We deliberately do not auto-fix here —
// silently adding `export` (or rewriting `as` to `satisfies`) changes a module's public surface or
// type semantics, which is too invasive for a lint fix.
function reportParentRole(
  context: Context,
  contextProps: { attr: ESTree.JSXAttribute; expr: ESTree.Expression | null }[],
  outletSpreads: ESTree.JSXSpreadAttribute[],
  localTypeAliases: ReadonlyMap<string, ESTree.TSTypeAliasDeclaration>,
  exportedNames: ReadonlySet<string>,
): void {
  for (const spread of outletSpreads) {
    context.report({ node: spread, messageId: "outletSpreadAttribute" });
  }
  for (const { attr, expr } of contextProps) {
    if (expr === null) {
      context.report({ node: attr, messageId: "missingOutletContextAnnotation" });
      continue;
    }
    if (expr.type === "TSAsExpression") {
      context.report({ node: expr, messageId: "useSatisfiesNotAs" });
      continue;
    }
    if (expr.type !== "TSSatisfiesExpression") {
      context.report({ node: expr, messageId: "missingOutletContextAnnotation" });
      continue;
    }

    const typeNode = expr.typeAnnotation;
    if (
      typeNode.type !== "TSTypeReference" ||
      typeNode.typeName.type !== "Identifier" ||
      typeNode.typeArguments !== null
    ) {
      context.report({ node: typeNode, messageId: "inlineOutletContextType" });
      continue;
    }

    const name = typeNode.typeName.name;
    const aliasNode = localTypeAliases.get(name);
    if (aliasNode === undefined) {
      context.report({ node: typeNode, messageId: "outletContextTypeNotLocal", data: { name } });
      continue;
    }
    if (!exportedNames.has(name)) {
      // Report at the type alias declaration: that is where `export` needs to be added.
      context.report({
        node: aliasNode,
        messageId: "outletContextTypeNotExported",
        data: { name },
      });
    }
  }
}

function reportChildRole(
  context: Context,
  parentInfo: RouteModuleInfo | undefined,
  calls: ESTree.CallExpression[],
  knownNames: ReadonlySet<string>,
  lastImport: ESTree.ImportDeclaration | null,
): void {
  if (parentInfo === undefined || calls.length === 0) {
    return;
  }

  const outlets = parentInfo.outlets;
  if (outlets.length === 0) {
    // The immediate parent renders no <Outlet>, so we cannot know what it passes. (A real child is
    // always rendered through a parent Outlet, so this only happens for unanalyzable parents.)
    return;
  }

  // Each <Outlet> resolves to either an importable named type or "no usable named context". Only
  // the immediate parent is consulted: React Router resets context at every Outlet, so a child's
  // context never comes from an ancestor beyond its nearest Outlet.
  const importableNames = [
    ...new Set(
      outlets.flatMap((outlet) =>
        outlet.annotation?.type.localTypeAlias?.exported === true
          ? [outlet.annotation.type.text]
          : [],
      ),
    ),
  ];

  if (importableNames.length > 1) {
    for (const call of calls) {
      context.report({ node: call.callee, messageId: "ambiguousParentOutletContext" });
    }
    return;
  }

  if (importableNames.length === 0) {
    // No Outlet passes an importable type. If every Outlet is a bare `<Outlet />` (no context prop
    // and no spread), the context is definitively `undefined` at runtime, so calling
    // useOutletContext here is a misuse — report it (without a fix). Otherwise the parent passes
    // context that is not yet a usable named type; `require`-style messages on the parent cover
    // that, so stay silent.
    const everyOutletIsBare = outlets.every((outlet) => !outlet.passesContext && !outlet.hasSpread);
    if (everyOutletIsBare) {
      for (const call of calls) {
        context.report({ node: call.callee, messageId: "parentOutletPassesNoContext" });
      }
    }
    return;
  }

  const expected = importableNames[0]!;
  // The single importable name must be passed by *every* Outlet; if some Outlet passes nothing (or
  // a different/untyped value) the runtime type is a union we will not guess, so bail out.
  const everyOutletPassesExpected = outlets.every(
    (outlet) => outlet.annotation?.type.text === expected,
  );
  if (!everyOutletPassesExpected) {
    for (const call of calls) {
      context.report({ node: call.callee, messageId: "ambiguousParentOutletContext" });
    }
    return;
  }
  const moduleSpecifier = toModuleSpecifier(context.physicalFilename, parentInfo.physicalFile);
  let importPlanned = knownNames.has(expected);

  for (const call of calls) {
    const current = call.typeArguments?.params[0];
    const currentText =
      current === undefined
        ? null
        : normalizeWhitespace(context.sourceCode.text.slice(current.range[0], current.range[1]));
    if (currentText === expected) {
      continue;
    }

    const needsImport = !importPlanned;
    importPlanned = true;
    context.report({
      node: call.typeArguments ?? call.callee,
      messageId: call.typeArguments ? "outdatedOutletContextType" : "missingOutletContextType",
      data: { expected },
      fix: (fixer) => {
        const fixes = [
          call.typeArguments
            ? fixer.replaceTextRange(call.typeArguments.range, `<${expected}>`)
            : fixer.insertTextAfterRange(call.callee.range, `<${expected}>`),
        ];
        if (needsImport) {
          const statement = `import type { ${expected} } from "${moduleSpecifier}";`;
          fixes.push(
            lastImport === null
              ? fixer.insertTextBeforeRange([0, 0], `${statement}\n`)
              : fixer.insertTextAfterRange(lastImport.range, `\n${statement}`),
          );
        }
        return fixes;
      },
    });
  }
}

function isOutletName(
  name: ESTree.JSXOpeningElement["name"],
  directNames: ReadonlySet<string>,
  namespaceNames: ReadonlySet<string>,
): boolean {
  if (name.type === "JSXIdentifier") {
    return directNames.has(name.name);
  }
  if (name.type === "JSXMemberExpression") {
    return (
      name.object.type === "JSXIdentifier" &&
      namespaceNames.has(name.object.name) &&
      name.property.name === "Outlet"
    );
  }
  return false;
}

function toModuleSpecifier(fromFile: string, toFile: string): string {
  const specifier = relativePath(dirname(fromFile), toFile)
    .replaceAll("\\", "/")
    .replace(/\.(?:tsx?|jsx?|mts|cts|mjs|cjs)$/, "");
  return specifier.startsWith(".") ? specifier : `./${specifier}`;
}

function normalizeWhitespace(value: string): string {
  return value.replaceAll(/\s+/g, " ").trim();
}

export default typeSafeOutletContext;
