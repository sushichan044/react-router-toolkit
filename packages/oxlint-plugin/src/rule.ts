import { resolve as resolvePath } from "node:path";

import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

import type { RoutesContext, RoutesFileOption } from "./detect-routes-file";
import { detectRoutesContext } from "./detect-routes-file";
import { evaluateRouteModulePaths } from "./evaluate";
import { createFileExistenceChecker } from "./file-existence";
import type { FileLiteral } from "./locate-literal";
import { buildLiteralLocationMap, extractFileLiteral } from "./locate-literal";
import { getRuleDocsURL } from "./utils";

export type Options = [RoutesFileOption?];

type MessageIds = "missingRouteFile";

const validRouteFile = defineRule({
  meta: {
    defaultOptions: [] satisfies Options,
    type: "problem",
    docs: {
      description:
        "Ensure every route module path declared in `routes.ts` (`index`, `route`, `layout`, ...) points to an existing file.",
      url: getRuleDocsURL("valid-route-file"),
    },
    messages: {
      missingRouteFile: 'Route module "{{file}}" does not exist (resolved: {{resolved}}).',
    } satisfies Record<MessageIds, string>,
    schema: [
      {
        type: "object",
        additionalProperties: false,
        properties: {
          root: {
            type: "string",
            description:
              "Vite root (directory containing `vite.config.*` and `app/`). Defaults to the parent of `appDirectory`.",
          },
          appDirectory: {
            type: "string",
            description:
              "Directory that route module paths resolve against. Defaults to the directory holding `routes.ts`.",
          },
        },
      },
    ],
  },
  createOnce: (context) => {
    const fileExists = createFileExistenceChecker();

    // Reset per file in `before()`.
    let routesContext: RoutesContext | null = null;
    const literals: FileLiteral[] = [];
    let exportDefaultNode: ESTree.Node | null = null;

    return {
      before() {
        routesContext = null;
        literals.length = 0;
        exportDefaultNode = null;

        const option = context.options[0] as RoutesFileOption | undefined;
        const detected = detectRoutesContext(
          context.physicalFilename,
          context.sourceCode.text,
          option,
        );
        if (detected === null) {
          // Not a route config file — skip the whole file.
          return false;
        }
        routesContext = detected;
        return true;
      },

      CallExpression(node) {
        if (routesContext === null) {
          return;
        }
        const literal = extractFileLiteral(node);
        if (literal !== null) {
          literals.push(literal);
        }
      },

      ExportDefaultDeclaration(node) {
        if (routesContext === null) {
          return;
        }
        exportDefaultNode = node;
      },

      "Program:exit"(programNode) {
        if (routesContext === null) {
          return;
        }
        const { appDirectory, root } = routesContext;

        const declaredFiles = evaluateRouteModulePaths(root, context.physicalFilename);
        if (declaredFiles === null) {
          return;
        }

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
