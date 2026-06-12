import { defineRule } from "@oxlint/plugins";
import type { ESTree, Settings } from "@oxlint/plugins";
import { collectRouteParams } from "react-router-toolkit";

import type { ReactRouterToolkitSettings, RouteModuleInfo } from "../settings";
import { readSettings } from "../settings";
import { getRuleDocsURL } from "../utils";

type MessageIds = "unknownRouteParam";

const validRouteParams = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Ensure useParams() only accesses route parameters that exist on the current route (including inherited ancestor params).",
      url: getRuleDocsURL("valid-route-params"),
    },
    messages: {
      unknownRouteParam:
        'Route param "{{name}}" does not exist on this route (available: {{available}}). Check the route path definition in routes.ts.',
    } satisfies Record<MessageIds, string>,
  },
  createOnce: (context) => {
    // Memoize settings by reference — the settings object is the same across all files in a run.
    let settingsSource: Readonly<Settings> | undefined;
    let settings: ReactRouterToolkitSettings | null = null;
    // Map from physicalFile → allowed param names (union across all route ids for that file).
    let allowedParamsByFile = new Map<string, Set<string>>();

    // Per-file state, reset in `before()`.
    // Local name of `useParams` imported from react-router / react-router-dom.
    let useParamsLocalName: string | null = null;
    // Bindings that hold the return value of useParams() — varName → node.
    let useParamsBindings = new Map<string, ESTree.Node>();
    // Allowed params for the current file.
    let allowedParams: Set<string> | null = null;

    function rebuildFromSettings(s: ReactRouterToolkitSettings): void {
      allowedParamsByFile = new Map<string, Set<string>>();

      // Build a Map<routeId, Set<paramName>> from the manifest.
      const paramsByRouteId = collectRouteParams(s.resolvedSettings.routes);

      // Now build Map<physicalFile, Set<paramName>> using routeModules.
      for (const entry of Object.values(s.routeModules) as RouteModuleInfo[]) {
        const routeParams = paramsByRouteId.get(entry.id) ?? new Set<string>();
        const existing = allowedParamsByFile.get(entry.physicalFile);
        if (existing === undefined) {
          allowedParamsByFile.set(entry.physicalFile, new Set(routeParams));
        } else {
          for (const param of routeParams) {
            existing.add(param);
          }
        }
      }
    }

    function formatAvailable(params: Set<string>): string {
      if (params.size === 0) {
        return "none";
      }
      return [...params].sort().join(", ");
    }

    function reportUnknown(node: ESTree.Node, name: string): void {
      if (allowedParams === null) {
        return;
      }
      if (allowedParams.has(name)) {
        return;
      }
      context.report({
        node,
        messageId: "unknownRouteParam",
        data: {
          name,
          available: formatAvailable(allowedParams),
        },
      });
    }

    return {
      before: () => {
        // Reset per-file state.
        useParamsLocalName = null;
        useParamsBindings = new Map();
        allowedParams = null;

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

        // Only lint files that are registered as route modules.
        const fileAllowed = allowedParamsByFile.get(context.physicalFilename);
        if (fileAllowed === undefined) {
          return false;
        }
        allowedParams = fileAllowed;

        // Fast path: skip files that cannot possibly contain useParams calls.
        return context.sourceCode.text.includes("useParams");
      },

      ImportDeclaration: (node) => {
        const source = node.source.value;
        if (typeof source !== "string") return;
        if (source !== "react-router" && source !== "react-router-dom") return;

        for (const specifier of node.specifiers) {
          if (specifier.type !== "ImportSpecifier") continue;
          const imported =
            specifier.imported.type === "Identifier"
              ? specifier.imported.name
              : String(specifier.imported.value);
          if (imported === "useParams") {
            useParamsLocalName = specifier.local.name;
          }
        }
      },

      VariableDeclarator: (node) => {
        if (useParamsLocalName === null) return;
        if (allowedParams === null) return;

        // Match `something = useParams()` or `something = useParams<...>()`
        const init = node.init;
        if (!init || init.type !== "CallExpression") return;

        const callee = init.callee;
        if (callee.type !== "Identifier" || callee.name !== useParamsLocalName) return;

        const id = node.id;

        if (id.type === "ObjectPattern") {
          // Pattern 1: `const { shop_id } = useParams()` or `const { shop_id: localVar } = useParams()`
          for (const prop of id.properties) {
            if (prop.type !== "Property") continue;
            // Skip computed keys like `{ [expr]: x }` — we cannot statically know the key.
            if (prop.computed) continue;
            const keyNode = prop.key;
            let keyName: string | null = null;
            if (keyNode.type === "Identifier") {
              keyName = keyNode.name;
            } else if (keyNode.type === "Literal" && typeof keyNode.value === "string") {
              keyName = keyNode.value;
            }
            if (keyName !== null) {
              reportUnknown(keyNode, keyName);
            }
          }
        } else if (id.type === "Identifier") {
          // Pattern 2: `const params = useParams()` — record the binding for member access checks.
          useParamsBindings.set(id.name, node);
        }
      },

      MemberExpression: (node) => {
        if (allowedParams === null) return;

        const obj = node.object;
        if (obj.type !== "Identifier") return;
        if (!useParamsBindings.has(obj.name)) return;

        if (!node.computed) {
          // `params.shopId`
          const prop = node.property;
          if (prop.type === "Identifier") {
            reportUnknown(prop, prop.name);
          }
        } else {
          // `params["shopId"]` — only string literals
          const prop = node.property;
          if (prop.type === "Literal" && typeof prop.value === "string") {
            reportUnknown(prop, prop.value);
          }
        }
      },
    };
  },
});

export default validRouteParams;
