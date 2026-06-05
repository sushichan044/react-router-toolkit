import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";

import { parseSync } from "oxc-parser";
import type { JSXAttribute, JSXOpeningElement, Node, Program, Statement } from "oxc-parser";

import type { ResolvedReactRouterConfig } from "./vendor/react-router/config/config";

/** A character offset span (`[start, end)`) within the analyzed module's source text. */
export interface SourceSpan {
  start: number;
  end: number;
}

/** The `satisfies` / `as` type annotation attached to an `<Outlet context={...}>` value. */
export interface OutletContextTypeReference {
  /** Source text of the type annotation (e.g. `"ShopContext"` or `"{ shopId: string }"`). */
  text: string;
  /** Location of the type annotation within the module. */
  span: SourceSpan;
  /**
   * Set when `text` is a bare identifier naming a `type` alias declared in this same module, which
   * is what lets a descendant route import the type from here. `null` otherwise (inline type,
   * generic, qualified name, or a name declared elsewhere).
   */
  localTypeAlias: { exported: boolean; span: SourceSpan } | null;
}

/**
 * One `<Outlet>` rendered by a route module. Every Outlet is recorded — including those that pass
 * no `context` — because React Router resets outlet context to `undefined` at each Outlet, so a
 * child's context is decided solely by its immediate parent's Outlet, never an ancestor's.
 */
export interface OutletInfo {
  /** Location of the `<Outlet>` opening element. */
  span: SourceSpan;
  /** Whether the Outlet has a `context={...}` prop at all. `false` means it passes `undefined`. */
  passesContext: boolean;
  /** Whether the Outlet has spread attributes (`{...props}`), making its context indeterminate. */
  hasSpread: boolean;
  /** The `satisfies` / `as` annotation on the context value, or `null` when not annotated. */
  annotation: { operator: "satisfies" | "as"; type: OutletContextTypeReference } | null;
}

/** Route manifest entry enriched with on-disk location and the outlets it renders. */
export interface RouteModuleInfo {
  id: string;
  parentId?: string;
  /** Module path relative to the app directory, as in the route manifest. */
  file: string;
  /** Absolute path to the module on disk. */
  physicalFile: string;
  /** Every `<Outlet>` rendered by this module, in source order. */
  outlets: OutletInfo[];
}

/**
 * Analyze every route module's source and return manifest entries enriched with their physical path
 * and the outlets they render. This is pure syntax analysis (no type checking): descendant routes
 * consume the result to type `useOutletContext` by importing the parent's annotated type.
 */
export function analyzeRouteModules(
  resolved: Pick<ResolvedReactRouterConfig, "appDirectory" | "routes">,
): Record<string, RouteModuleInfo> {
  const result: Record<string, RouteModuleInfo> = {};
  for (const entry of Object.values(resolved.routes)) {
    const physicalFile = resolvePath(resolved.appDirectory, entry.file);
    result[entry.id] = {
      id: entry.id,
      ...(entry.parentId === undefined ? {} : { parentId: entry.parentId }),
      file: entry.file,
      physicalFile,
      outlets: analyzeModuleFile(physicalFile),
    };
  }
  return result;
}

function analyzeModuleFile(physicalFile: string): OutletInfo[] {
  let source: string;
  try {
    source = readFileSync(physicalFile, "utf8");
  } catch {
    return [];
  }
  const { program } = parseSync(physicalFile, source);
  return extractOutlets(program, source);
}

interface ModuleScope {
  readonly outletDirect: Set<string>;
  readonly outletNamespaces: Set<string>;
  readonly localAliases: Map<string, SourceSpan>;
  readonly exportedNames: Set<string>;
}

function extractOutlets(program: Program, source: string): OutletInfo[] {
  const scope = collectModuleScope(program);
  if (scope.outletDirect.size === 0 && scope.outletNamespaces.size === 0) {
    return [];
  }

  const outlets: OutletInfo[] = [];
  walk(program, (node) => {
    if (node.type === "JSXOpeningElement" && isOutletName(node.name, scope)) {
      outlets.push(buildOutletInfo(node, source, scope));
    }
  });
  return outlets;
}

function collectModuleScope(program: Program): ModuleScope {
  const scope: ModuleScope = {
    outletDirect: new Set(),
    outletNamespaces: new Set(),
    localAliases: new Map(),
    exportedNames: new Set(),
  };

  for (const statement of program.body as Statement[]) {
    if (statement.type === "ImportDeclaration") {
      const source = statement.source.value;
      if (source !== "react-router" && source !== "react-router-dom") {
        continue;
      }
      for (const specifier of statement.specifiers) {
        if (specifier.type === "ImportNamespaceSpecifier") {
          scope.outletNamespaces.add(specifier.local.name);
        } else if (
          specifier.type === "ImportSpecifier" &&
          specifier.imported.type === "Identifier" &&
          specifier.imported.name === "Outlet"
        ) {
          scope.outletDirect.add(specifier.local.name);
        }
      }
    } else if (statement.type === "TSTypeAliasDeclaration") {
      scope.localAliases.set(statement.id.name, { start: statement.start, end: statement.end });
    } else if (statement.type === "ExportNamedDeclaration") {
      const declaration = statement.declaration;
      if (declaration !== null && declaration.type === "TSTypeAliasDeclaration") {
        scope.localAliases.set(declaration.id.name, {
          start: declaration.start,
          end: declaration.end,
        });
        scope.exportedNames.add(declaration.id.name);
      }
      for (const specifier of statement.specifiers) {
        if (specifier.local.type === "Identifier") {
          scope.exportedNames.add(specifier.local.name);
        }
      }
    }
  }
  return scope;
}

function isOutletName(name: JSXOpeningElement["name"], scope: ModuleScope): boolean {
  if (name.type === "JSXIdentifier") {
    return scope.outletDirect.has(name.name);
  }
  if (name.type === "JSXMemberExpression") {
    return (
      name.object.type === "JSXIdentifier" &&
      scope.outletNamespaces.has(name.object.name) &&
      name.property.name === "Outlet"
    );
  }
  return false;
}

function buildOutletInfo(
  element: JSXOpeningElement,
  source: string,
  scope: ModuleScope,
): OutletInfo {
  let passesContext = false;
  let hasSpread = false;
  let annotation: OutletInfo["annotation"] = null;

  for (const attribute of element.attributes) {
    if (attribute.type === "JSXSpreadAttribute") {
      hasSpread = true;
    } else if (attribute.name.type === "JSXIdentifier" && attribute.name.name === "context") {
      passesContext = true;
      annotation = readAnnotation(attribute, source, scope);
    }
  }

  return { span: { start: element.start, end: element.end }, passesContext, hasSpread, annotation };
}

function readAnnotation(
  attribute: JSXAttribute,
  source: string,
  scope: ModuleScope,
): OutletInfo["annotation"] {
  const value = attribute.value;
  if (value === null || value.type !== "JSXExpressionContainer") {
    return null;
  }
  const expression = value.expression;
  if (expression.type !== "TSSatisfiesExpression" && expression.type !== "TSAsExpression") {
    return null;
  }

  const typeNode = expression.typeAnnotation;
  const text = source.slice(typeNode.start, typeNode.end);
  const isBareReference =
    typeNode.type === "TSTypeReference" &&
    typeNode.typeName.type === "Identifier" &&
    typeNode.typeArguments === null;
  const localTypeAlias =
    isBareReference && scope.localAliases.has(text)
      ? { exported: scope.exportedNames.has(text), span: scope.localAliases.get(text)! }
      : null;

  return {
    operator: expression.type === "TSSatisfiesExpression" ? "satisfies" : "as",
    type: { text, span: { start: typeNode.start, end: typeNode.end }, localTypeAlias },
  };
}

function walk(node: unknown, visit: (node: Node) => void): void {
  if (Array.isArray(node)) {
    for (const item of node) {
      walk(item, visit);
    }
    return;
  }
  if (node === null || typeof node !== "object") {
    return;
  }
  if (typeof (node as { type?: unknown }).type === "string") {
    visit(node as Node);
  }
  for (const [key, value] of Object.entries(node)) {
    if (key !== "parent") {
      walk(value, visit);
    }
  }
}
