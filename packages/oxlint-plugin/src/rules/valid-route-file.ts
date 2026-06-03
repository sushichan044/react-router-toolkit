import { existsSync } from "node:fs";
import { relative as relativePath, resolve as resolvePath } from "node:path";

import { defineRule } from "@oxlint/plugins";
import type { ESTree, Settings } from "@oxlint/plugins";

import { isRoutesConfigFile } from "../detect-routes-file";
import type { ReactRouterToolkitSettings } from "../settings";
import { readSettings } from "../settings";
import { getRuleDocsURL } from "../utils";

type MessageIds = "missingDefaultExport" | "missingRouteFile";

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

        // routes.ts must have a default export
        if (exportDefaultNode === null) {
          context.report({
            loc: { line: 1, column: 0 },
            messageId: "missingDefaultExport",
          });
          return;
        }

        const { root } = settings;
        const { appDirectory, routes } = settings.resolvedSettings;

        // The resolved manifest is the source of truth, so every route module is checked regardless
        // of how it was declared (literal path, `relative()`, fs-routes, composed arrays, ...). The
        // syntactic origin of each path is not recoverable in those cases, so all findings are
        // reported on the `export default` keyword. Narrowing to the keyword (rather than the whole
        // declaration) keeps the squiggle off the entire route array, which can span the file.
        const declaredFiles = [
          ...new Set(
            Object.values(routes)
              .filter((entry) => entry.id !== "root")
              .map((entry) => entry.file),
          ),
        ];

        // Avoid reporting on the whole export default node.
        // If we do so, users will see the error on the entire routes array, and it is very uncomfortable experiencing in the IDEs.
        const reportLoc = {
          start: exportDefaultNode.loc.start,
          end: exportDefaultNode.declaration.loc.start,
        };

        for (const file of declaredFiles) {
          const resolved = resolvePath(appDirectory, file);
          if (existsSync(resolved)) {
            continue;
          }
          context.report({
            loc: reportLoc,
            messageId: "missingRouteFile",
            data: { file, resolved: relativePath(root, resolved) },
          });
        }
      },
    };
  },
});

export default validRouteFile;
