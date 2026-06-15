import { relative as relativePath } from "node:path";

import { defineRule } from "@oxlint/plugins";
import type { ESTree, Settings } from "@oxlint/plugins";

import { isRoutesConfigFile } from "../detect-routes-file";
import type { ReactRouterToolkitSettings } from "../settings";
import { readSettings } from "../settings";
import { getRuleDocsURL } from "../utils";

type MessageIds = "missingDefaultExport" | "missingRouteFile" | "orphanRouteFile";

const validRouteFile = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Ensure every route module path declared in `routes.ts` (`index`, `route`, `layout`, ...) points to an existing file.",
      url: getRuleDocsURL("valid-route-file"),
    },
    messages: {
      missingDefaultExport:
        "Routing config file must default-export its route config (e.g. `export default [...] satisfies RouteConfig`).",
      missingRouteFile: 'Route module "{{file}}" does not exist (resolved: {{resolved}}).',
      orphanRouteFile:
        'Route file "{{file}}" exists but is not registered in this route config. Register it or move it out of the app directory.',
    } satisfies Record<MessageIds, string>,
  },
  createOnce: (context) => {
    // `context.settings` is only readable per file (not in `createOnce`), so resolve it in
    // `before()` and memoize by reference since it is the same object across files in a run.
    let settingsSource: Readonly<Settings> | undefined;
    let settings: ReactRouterToolkitSettings | null = null;

    // Reset per file in `before()`.
    let isRoutesFile = false;
    let exportDefaultNode: ESTree.ExportDefaultDeclaration | null = null;

    return {
      before: () => {
        isRoutesFile = false;
        exportDefaultNode = null;

        if (context.settings !== settingsSource) {
          settingsSource = context.settings;
          settings = readSettings(context.settings);
        }

        if (settings === null) {
          // The plugin is enabled but no resolved config was provided via `settings`.
          return false;
        }
        if (
          !isRoutesConfigFile(
            context.physicalFilename,
            context.sourceCode.text,
            settings.resolvedSettings.appDirectory,
          )
        ) {
          return false;
        }
        isRoutesFile = true;
        return true;
      },

      ExportDefaultDeclaration: (node) => {
        if (!isRoutesFile) {
          return;
        }
        exportDefaultNode = node;
      },

      "Program:exit": () => {
        if (!isRoutesFile || settings === null) {
          return;
        }

        if (exportDefaultNode === null) {
          context.report({
            loc: { line: 1, column: 0 },
            messageId: "missingDefaultExport",
          });
          return;
        }

        const { root, routeModules } = settings;

        // The analyzed manifest is the source of truth, so every route module is checked regardless
        // of how it was declared (literal path, `relative()`, fs-routes, composed arrays, ...). The
        // syntactic origin of each path is not recoverable in those cases, so all findings are
        // reported on the `export default` keyword. Narrowing to the keyword (rather than the whole
        // declaration) keeps the squiggle off the entire route array, which can span the file.
        const reportLoc = {
          start: exportDefaultNode.loc.start,
          end: exportDefaultNode.declaration.loc.start,
        };

        // File existence was determined at setup time (`analyzeRouteModules`); rules never touch
        // the filesystem. Several route ids can register the same file, so report each file once.
        const reportedFiles = new Set<string>();
        for (const entry of Object.values(routeModules)) {
          if (entry.id === "root" || entry.fileExists || reportedFiles.has(entry.physicalFile)) {
            continue;
          }
          reportedFiles.add(entry.physicalFile);
          context.report({
            loc: reportLoc,
            messageId: "missingRouteFile",
            data: { file: entry.file, resolved: relativePath(root, entry.physicalFile) },
          });
        }

        // Orphan route files were computed at setup time (`findOrphanRouteFiles`); report each one.
        for (const file of settings.orphanRouteFiles) {
          context.report({
            loc: reportLoc,
            messageId: "orphanRouteFile",
            data: { file },
          });
        }
      },
    };
  },
});

export default validRouteFile;
