import { defineRule } from "@oxlint/plugins";
import type { ESTree, Settings } from "@oxlint/plugins";
import { dirname, join, normalize, relative } from "pathe";

import type { ReactRouterToolkitSettings, RouteModuleInfo } from "../settings";
import { readSettings } from "../settings";
import { getRuleDocsURL } from "../utils";

type MessageIds = "crossRouteImport";

interface RuleOptions {
  allowTypeImports: boolean;
}

const RESOLVABLE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".mts"];

const noCrossRouteImports = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow importing route modules from other route modules to prevent tight coupling between routes.",
      url: getRuleDocsURL("no-cross-route-imports"),
    },
    messages: {
      crossRouteImport:
        'Importing route module "{{target}}" from another route couples the two routes. Move the shared code outside the routes directory (or into a shared module) instead.',
    } satisfies Record<MessageIds, string>,
    schema: [
      {
        type: "object",
        properties: {
          allowTypeImports: {
            type: "boolean",
            default: true,
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
    let routeFilesSet = new Set<string>();
    let entriesByFile = new Map<string, RouteModuleInfo[]>();

    // Per-file state, reset in `before()`.
    let isSelfRouteFile = false;
    let selfPhysicalFile = "";

    function getOptions(): RuleOptions {
      const raw = (context.options as unknown[])[0];
      if (raw !== null && typeof raw === "object" && "allowTypeImports" in raw) {
        const val = (raw as { allowTypeImports?: unknown }).allowTypeImports;
        if (typeof val === "boolean") {
          return { allowTypeImports: val };
        }
      }
      return { allowTypeImports: true };
    }

    function rebuildFromSettings(s: ReactRouterToolkitSettings): void {
      routeFilesSet = new Set<string>();
      entriesByFile = new Map<string, RouteModuleInfo[]>();

      for (const entry of Object.values(s.routeModules)) {
        routeFilesSet.add(entry.physicalFile);
        const entries = entriesByFile.get(entry.physicalFile);
        if (entries === undefined) {
          entriesByFile.set(entry.physicalFile, [entry]);
        } else {
          entries.push(entry);
        }
      }
    }

    function resolveSpecifierCandidates(specifier: string): string[] {
      if (settings === null) {
        return [];
      }

      const candidates: string[] = [];

      if (specifier.startsWith("./") || specifier.startsWith("../")) {
        // Relative import: resolve against the current file's directory.
        const base = normalize(join(dirname(selfPhysicalFile), specifier));
        candidates.push(base);
        for (const ext of RESOLVABLE_EXTENSIONS) {
          candidates.push(`${base}${ext}`);
        }
      } else {
        // Try alias resolution.
        for (const { alias, targets } of settings.importAliases) {
          const matchesAlias = alias.endsWith("/")
            ? specifier.startsWith(alias)
            : specifier === alias || specifier.startsWith(`${alias}/`);
          if (!matchesAlias) {
            continue;
          }
          const residue = specifier.slice(alias.length);
          for (const target of targets) {
            // target already ends with `/` for wildcard aliases.
            const base = normalize(`${target}${residue}`);
            candidates.push(base);
            for (const ext of RESOLVABLE_EXTENSIONS) {
              candidates.push(`${base}${ext}`);
            }
          }
        }
      }

      return candidates;
    }

    function isCrossRouteImport(specifier: string): boolean {
      const candidates = resolveSpecifierCandidates(specifier);
      for (const candidate of candidates) {
        if (routeFilesSet.has(candidate) && candidate !== selfPhysicalFile) {
          return true;
        }
      }
      return false;
    }

    function getTargetName(specifier: string): string {
      const candidates = resolveSpecifierCandidates(specifier);
      for (const candidate of candidates) {
        if (routeFilesSet.has(candidate) && candidate !== selfPhysicalFile) {
          // Render relative to the project root: shorter and stable across machines.
          return settings !== null ? relative(settings.root, candidate) : candidate;
        }
      }
      return specifier;
    }

    function checkImportNode(
      node: ESTree.Node,
      source: ESTree.StringLiteral,
      importKind: "type" | "value",
      specifiers?: ESTree.ImportDeclarationSpecifier[],
    ): void {
      const { allowTypeImports } = getOptions();
      const specifierValue = source.value;

      // Skip type-only import declarations when allowTypeImports is enabled.
      if (allowTypeImports && importKind === "type") {
        return;
      }

      // For value imports, check if all individual specifiers are type-only.
      // `import { type X, type Y }` — all specifiers are type-only, skip when allowTypeImports.
      if (
        allowTypeImports &&
        importKind === "value" &&
        specifiers !== undefined &&
        specifiers.length > 0 &&
        specifiers.every(
          (s): s is ESTree.ImportSpecifier =>
            s.type === "ImportSpecifier" && s.importKind === "type",
        )
      ) {
        return;
      }

      if (isCrossRouteImport(specifierValue)) {
        context.report({
          node,
          messageId: "crossRouteImport",
          data: { target: getTargetName(specifierValue) },
        });
      }
    }

    return {
      before: () => {
        isSelfRouteFile = false;
        selfPhysicalFile = "";

        if (context.settings !== settingsSource) {
          settingsSource = context.settings;
          settings = readSettings(context.settings);
          if (settings !== null) {
            rebuildFromSettings(settings);
          }
        }

        if (settings === null) {
          return false;
        }

        const selfEntries = entriesByFile.get(context.physicalFilename) ?? [];
        if (selfEntries.length === 0) {
          return false;
        }

        isSelfRouteFile = true;
        selfPhysicalFile = context.physicalFilename;

        // Fast path: skip files that cannot possibly contain import or re-export statements.
        const text = context.sourceCode.text;
        return text.includes("import") || text.includes("export");
      },

      ImportDeclaration: (node) => {
        if (!isSelfRouteFile) {
          return;
        }
        checkImportNode(node, node.source, node.importKind ?? "value", node.specifiers);
      },

      ExportNamedDeclaration: (node) => {
        if (!isSelfRouteFile) {
          return;
        }
        if (node.source === null) {
          return;
        }
        // `export { x } from "..."` or `export type { x } from "..."`
        checkImportNode(
          node,
          node.source,
          node.exportKind === "type" ? "type" : "value",
          undefined,
        );
      },

      ExportAllDeclaration: (node) => {
        if (!isSelfRouteFile) {
          return;
        }
        if (node.source === null) {
          return;
        }
        // `export * from "..."` or `export * as ns from "..."`
        checkImportNode(
          node,
          node.source,
          node.exportKind === "type" ? "type" : "value",
          undefined,
        );
      },
    };
  },
});

export default noCrossRouteImports;
