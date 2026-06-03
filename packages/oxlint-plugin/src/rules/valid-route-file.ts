import { resolve as resolvePath } from "node:path";

import { defineRule } from "@oxlint/plugins";
import type { ESTree, Settings } from "@oxlint/plugins";

import { isRoutesConfigFile } from "../detect-routes-file";
import { createFileExistenceChecker } from "../file-existence";
import type { FileLiteral } from "../locate-literal";
import { buildLiteralLocationMap, extractFileLiteral } from "../locate-literal";
import type { ReactRouterToolkitSettings } from "../settings";
import { readSettings } from "../settings";
import { getRuleDocsURL } from "../utils";

type MessageIds = "missingRouteFile";

const validRouteFile = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Ensure every route module path declared in `routes.ts` (`index`, `route`, `layout`, ...) points to an existing file.",
      url: getRuleDocsURL("valid-route-file"),
    },
    messages: {
      missingRouteFile: 'Route module "{{file}}" does not exist (resolved: {{resolved}}).',
    } satisfies Record<MessageIds, string>,
  },
  createOnce: (context) => {
    const fileExists = createFileExistenceChecker();

    // `context.settings` is only readable per file (not in `createOnce`), so resolve it in
    // `before()` and memoize by reference since it is the same object across files in a run.
    let settingsSource: Readonly<Settings> | undefined;
    let settings: ReactRouterToolkitSettings | null = null;

    // Reset per file in `before()`.
    let isRoutesFile = false;
    const literals: FileLiteral[] = [];
    let exportDefaultNode: ESTree.Node | null = null;

    return {
      before: () => {
        isRoutesFile = false;
        literals.length = 0;
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
            settings.appDirectory,
          )
        ) {
          return false;
        }
        isRoutesFile = true;
        return true;
      },

      CallExpression: (node) => {
        if (!isRoutesFile) {
          return;
        }
        const literal = extractFileLiteral(node);
        if (literal !== null) {
          literals.push(literal);
        }
      },

      ExportDefaultDeclaration: (node) => {
        if (!isRoutesFile) {
          return;
        }
        exportDefaultNode = node;
      },

      "Program:exit": (programNode) => {
        if (!isRoutesFile || settings === null) {
          return;
        }
        const { appDirectory, routes } = settings;

        const declaredFiles = [
          ...new Set(
            Object.values(routes)
              .filter((entry) => entry.id !== "root")
              .map((entry) => entry.file),
          ),
        ];

        const locationMap = buildLiteralLocationMap(literals, appDirectory);
        const fallbackNode = exportDefaultNode ?? programNode;

        for (const file of declaredFiles) {
          const resolved = resolvePath(appDirectory, file);
          if (fileExists(resolved)) {
            continue;
          }
          context.report({
            node: locationMap.get(resolved) ?? fallbackNode,
            messageId: "missingRouteFile",
            data: { file, resolved },
          });
        }
      },
    };
  },
});

export default validRouteFile;
