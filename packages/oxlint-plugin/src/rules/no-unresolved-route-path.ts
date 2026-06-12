import { defineRule } from "@oxlint/plugins";
import type { ESTree, Settings } from "@oxlint/plugins";
import type { RouteObject } from "react-router";
import {
  buildRouteTreeFromManifest,
  matchesRoutePattern,
  parsePathTemplate,
} from "react-router-toolkit";

import type { ReactRouterToolkitSettings } from "../settings";
import { readSettings } from "../settings";
import { getRuleDocsURL } from "../utils";

type MessageIds = "unresolvedRoutePath";

interface RuleOptions {
  /** Path prefixes that are always considered valid (e.g. external or admin-only routes). */
  allowedPaths: readonly string[];
}

const noUnresolvedRoutePath = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Ensure paths passed to navigation APIs and link components match a route in the React Router route config.",
      url: getRuleDocsURL("no-unresolved-route-path"),
    },
    messages: {
      unresolvedRoutePath:
        'Path "{{path}}" does not match any route in the route config. If this points outside this React Router app, add it to the rule\'s `allowedPaths` option.',
    } satisfies Record<MessageIds, string>,
    schema: [
      {
        type: "object",
        properties: {
          allowedPaths: {
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
    let routeTree: RouteObject[] = [];
    let basename = "/";
    let publicAssets: Set<string> = new Set();

    // Per-file state, reset in `before()`.
    let redirectLocalName: string | null = null;
    let linkLocalName: string | null = null;
    let navLinkLocalName: string | null = null;
    let formLocalName: string | null = null;

    function getOptions(): RuleOptions {
      const raw = (context.options as unknown[])[0];
      if (raw !== null && typeof raw === "object" && "allowedPaths" in raw) {
        const allowedPaths = (raw as { allowedPaths?: unknown }).allowedPaths;
        if (Array.isArray(allowedPaths)) {
          return { allowedPaths: allowedPaths as string[] };
        }
      }
      return { allowedPaths: [] };
    }

    function shouldSkipPath(path: string): boolean {
      // Only check absolute paths starting with /
      if (!path.startsWith("/")) {
        return true;
      }
      // Skip protocol-relative URLs (//example.com)
      if (path.startsWith("//")) {
        return true;
      }
      // Check allowedPaths prefix match
      const { allowedPaths } = getOptions();
      if (allowedPaths.some((prefix) => path.startsWith(prefix))) {
        return true;
      }
      return false;
    }

    function checkPath(node: ESTree.Node, path: string, displayPath?: string): void {
      if (shouldSkipPath(path)) {
        return;
      }
      const template = parsePathTemplate([path], 0);
      if (matchesRoutePattern(routeTree, template, basename)) {
        return;
      }
      // A string literal that doesn't match any route may still be a valid link to a static
      // public asset (e.g. `/manual.pdf`). Strip query/hash and decode the path before checking.
      const rawPathname = stripQueryAndHash(path);
      let decodedPathname: string;
      try {
        decodedPathname = decodeURI(rawPathname);
      } catch {
        decodedPathname = rawPathname;
      }
      if (publicAssets.has(decodedPathname)) {
        return;
      }
      context.report({
        node,
        messageId: "unresolvedRoutePath",
        data: { path: displayPath ?? path },
      });
    }

    function stripQueryAndHash(pathname: string): string {
      const qIdx = pathname.indexOf("?");
      const hIdx = pathname.indexOf("#");
      let end = pathname.length;
      if (qIdx !== -1) end = Math.min(end, qIdx);
      if (hIdx !== -1) end = Math.min(end, hIdx);
      return pathname.slice(0, end) || "/";
    }

    function checkTemplateLiteral(node: ESTree.TemplateLiteral): void {
      // Only inspect if the first quasi starts with /
      const firstQuasi = node.quasis[0];
      if (!firstQuasi) return;
      const cooked = firstQuasi.value.cooked;
      if (typeof cooked !== "string") return;
      if (!cooked.startsWith("/")) return;
      // Skip protocol-relative
      if (cooked.startsWith("//")) return;

      const quasiValues: string[] = node.quasis.map((q) => {
        const v = q.value.cooked;
        return typeof v === "string" ? v : "";
      });
      const expressionCount = node.expressions.length;

      // Check allowedPaths against the full raw string representation
      const rawPath = quasiValues.join("${…}");
      const { allowedPaths } = getOptions();
      if (allowedPaths.some((prefix) => rawPath.startsWith(prefix))) {
        return;
      }

      const template = parsePathTemplate(quasiValues, expressionCount);
      if (!matchesRoutePattern(routeTree, template, basename)) {
        // Reconstruct a display path showing where expressions are
        const displayPath = quasiValues.join("${…}");
        context.report({
          node,
          messageId: "unresolvedRoutePath",
          data: { path: displayPath },
        });
      }
    }

    function checkStringOrTemplate(
      valueNode: ESTree.Expression | ESTree.SpreadElement | null | undefined,
    ): void {
      if (!valueNode) return;
      if (valueNode.type === "Literal" && typeof valueNode.value === "string") {
        checkPath(valueNode, valueNode.value);
      } else if (valueNode.type === "TemplateLiteral") {
        checkTemplateLiteral(valueNode);
      }
    }

    return {
      before: () => {
        // Reset per-file state.
        redirectLocalName = null;
        linkLocalName = null;
        navLinkLocalName = null;
        formLocalName = null;

        // Rebuild route tree and public assets Set only when settings reference changes.
        if (context.settings !== settingsSource) {
          settingsSource = context.settings;
          settings = readSettings(context.settings);
          if (settings !== null) {
            routeTree = buildRouteTreeFromManifest(settings.resolvedSettings.routes);
            basename = settings.resolvedSettings.basename;
            publicAssets = new Set(settings.publicAssets);
          } else {
            routeTree = [];
            basename = "/";
            publicAssets = new Set();
          }
        }

        if (settings === null) {
          return false;
        }

        // Fast path: skip files that cannot possibly contain navigation calls.
        const text = context.sourceCode.text;
        const hasCandidates =
          text.includes("navigate") ||
          text.includes("redirect") ||
          text.includes(" to=") ||
          text.includes(" action=") ||
          text.includes("<a") ||
          text.includes("<Link") ||
          text.includes("<NavLink") ||
          text.includes("<Form");
        return hasCandidates;
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
          const local = specifier.local.name;

          switch (imported) {
            case "redirect": {
              redirectLocalName = local;
              break;
            }
            case "Link": {
              linkLocalName = local;
              break;
            }
            case "NavLink": {
              navLinkLocalName = local;
              break;
            }
            case "Form": {
              formLocalName = local;
              break;
            }
          }
        }
      },

      CallExpression: (node) => {
        const callee = node.callee;
        const isNavigate = callee.type === "Identifier" && callee.name === "navigate";
        const isRedirect =
          callee.type === "Identifier" &&
          redirectLocalName !== null &&
          callee.name === redirectLocalName;

        if (!isNavigate && !isRedirect) return;

        const firstArg = node.arguments[0];
        if (!firstArg) return;
        // Exclude SpreadElement
        if (firstArg.type === "SpreadElement") return;
        checkStringOrTemplate(firstArg as ESTree.Expression);
      },

      JSXOpeningElement: (node) => {
        const nameNode = node.name;
        let elementName: string | null = null;
        if (nameNode.type === "JSXIdentifier") {
          elementName = nameNode.name;
        } else if (nameNode.type === "JSXMemberExpression") {
          return; // e.g. <Router.Link> — skip
        }
        if (!elementName) return;

        const isLink = elementName === linkLocalName || elementName === "Link";
        const isNavLink = elementName === navLinkLocalName || elementName === "NavLink";
        const isForm = elementName === formLocalName || elementName === "Form";
        const isAnchor = elementName === "a";

        let targetAttrName: string | null = null;
        if (isLink || isNavLink) {
          targetAttrName = "to";
        } else if (isForm) {
          targetAttrName = "action";
        } else if (isAnchor) {
          targetAttrName = "href";
        }

        if (!targetAttrName) return;

        for (const attr of node.attributes) {
          if (attr.type !== "JSXAttribute") continue;
          const attrName = attr.name.type === "JSXIdentifier" ? attr.name.name : null;
          if (attrName !== targetAttrName) continue;

          const value = attr.value;
          if (!value) continue;

          if (value.type === "Literal" && typeof value.value === "string") {
            checkPath(value, value.value);
          } else if (value.type === "JSXExpressionContainer") {
            const expr = value.expression;
            if (expr.type === "JSXEmptyExpression") continue;
            checkStringOrTemplate(expr as ESTree.Expression);
          }
        }
      },
    };
  },
});

export default noUnresolvedRoutePath;
