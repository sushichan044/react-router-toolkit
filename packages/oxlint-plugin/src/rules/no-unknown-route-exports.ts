import { defineRule } from "@oxlint/plugins";
import type { ESTree, Settings } from "@oxlint/plugins";
import { RECOGNIZED_EXPORT_NAMES } from "react-router-toolkit";

import type { ReactRouterToolkitSettings, RouteModuleInfo } from "../settings";
import { readSettings } from "../settings";
import { getRuleDocsURL } from "../utils";

type MessageIds = "unknownRouteExport";

interface RuleOptions {
  /** Export names that are explicitly allowed even if not recognized by React Router. */
  allowedExports: readonly string[];
}

const noUnknownRouteExports = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow named exports from route modules that React Router does not recognize, preventing silent dead code.",
      url: getRuleDocsURL("no-unknown-route-exports"),
    },
    messages: {
      unknownRouteExport:
        '"{{name}}" is not a recognized React Router route module export, so React Router silently ignores it. If this export is intentional, add it to the rule\'s `allowedExports` option or move it to a non-route file.',
    } satisfies Record<MessageIds, string>,
    schema: [
      {
        type: "object",
        properties: {
          allowedExports: {
            type: "array",
            items: { type: "string" },
            default: [],
          },
        },
        additionalProperties: false,
      },
    ],
  },
  createOnce: (context) => {
    // Memoize settings by reference — the settings object is the same across all files in a run.
    let settingsSource: Readonly<Settings> | undefined;
    let settings: ReactRouterToolkitSettings | null = null;
    let entriesByFile = new Map<string, RouteModuleInfo[]>();
    let rootModuleFiles = new Set<string>();

    // Per-file state, reset in `before()`.
    let isRouteFile = false;
    let isRootModule = false;

    function getOptions(): RuleOptions {
      const raw = (context.options as unknown[])[0];
      if (raw !== null && typeof raw === "object" && "allowedExports" in raw) {
        const allowedExports = (raw as { allowedExports?: unknown }).allowedExports;
        if (Array.isArray(allowedExports)) {
          return { allowedExports: allowedExports as string[] };
        }
      }
      return { allowedExports: [] };
    }

    function isAllowed(name: string): boolean {
      // RECOGNIZED_EXPORT_NAMES is Set<keyof RouteModuleExports>; cast is safe because we only
      // use the result for a boolean membership check, not to narrow the type.
      if ((RECOGNIZED_EXPORT_NAMES as Set<string>).has(name)) {
        return true;
      }
      // `Layout` is a framework-mode export that React Router honors only on the root route.
      if (name === "Layout" && isRootModule) {
        return true;
      }
      const { allowedExports } = getOptions();
      return allowedExports.includes(name);
    }

    function reportUnknown(node: ESTree.Node, name: string): void {
      context.report({ node, messageId: "unknownRouteExport", data: { name } });
    }

    return {
      before: () => {
        isRouteFile = false;
        isRootModule = false;

        if (context.settings !== settingsSource) {
          settingsSource = context.settings;
          settings = readSettings(context.settings);
          entriesByFile = new Map();
          rootModuleFiles = new Set();
          if (settings !== null) {
            for (const [routeId, entry] of Object.entries(settings.routeModules)) {
              const entries = entriesByFile.get(entry.physicalFile);
              if (entries === undefined) {
                entriesByFile.set(entry.physicalFile, [entry]);
              } else {
                entries.push(entry);
              }
              if (routeId === "root") {
                rootModuleFiles.add(entry.physicalFile);
              }
            }
          }
        }

        if (settings === null) {
          return false;
        }

        const selfEntries = entriesByFile.get(context.physicalFilename) ?? [];
        if (selfEntries.length === 0) {
          return false;
        }

        isRouteFile = true;
        isRootModule = rootModuleFiles.has(context.physicalFilename);

        // Fast path: skip files that cannot possibly contain named exports.
        return context.sourceCode.text.includes("export");
      },

      ExportNamedDeclaration: (node) => {
        if (!isRouteFile) {
          return;
        }
        // Skip type-only export declarations: `export type { Foo }` or `export type Foo = ...`
        if (node.exportKind === "type") {
          return;
        }

        if (node.declaration !== null) {
          // `export function foo() {}`, `export const foo = ...`, `export class Foo {}`
          const decl = node.declaration;
          if (decl.type === "FunctionDeclaration" || decl.type === "ClassDeclaration") {
            if (decl.id !== null) {
              if (!isAllowed(decl.id.name)) {
                reportUnknown(node, decl.id.name);
              }
            }
          } else if (decl.type === "VariableDeclaration") {
            for (const declarator of decl.declarations) {
              if (declarator.id.type === "Identifier" && !isAllowed(declarator.id.name)) {
                reportUnknown(node, declarator.id.name);
              }
            }
          }
          // TSTypeAliasDeclaration and TSInterfaceDeclaration are type-only — skip them.
        } else {
          // `export { foo }`, `export { foo as bar }`, `export { foo } from "./x"`
          for (const specifier of node.specifiers) {
            // `export { type Foo }` — specifier-level type-only export
            if (specifier.exportKind === "type") {
              continue;
            }
            const exportedName =
              specifier.exported.type === "Identifier"
                ? specifier.exported.name
                : specifier.exported.value;
            if (!isAllowed(exportedName)) {
              reportUnknown(specifier, exportedName);
            }
          }
        }
      },
    };
  },
});

export default noUnknownRouteExports;
