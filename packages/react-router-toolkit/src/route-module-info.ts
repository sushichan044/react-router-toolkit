import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";

import { parseSync } from "oxc-parser";
import type {
  Declaration,
  Expression,
  ExportDefaultDeclaration,
  JSXAttribute,
  JSXOpeningElement,
  ModuleExportName,
  Node,
  Program,
  Statement,
} from "oxc-parser";

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

/** How a route-module export is written in source. String union for JSON-serializability. */
export type ExportDeclarationKind =
  | "function" // `export function loader() {}` / `export default function C() {}`
  | "class" // `export class C {}` / `export default class {}`
  | "arrow" // `export const action = async () => {}`
  | "variable" // `export const handle = { ... }` (init is not a function/class)
  | "expression" // `export default someValue` / `export default 42`
  | "reexport"; // `export { loader } from "./x"` / `export { x as loader }`

/** Metadata for one recognized route-module export. A non-`null` slot means the export is present. */
export interface RouteExportInfo {
  /** Location of the export declaration (or the specifier, for re-exports). */
  span: SourceSpan;
  declarationKind: ExportDeclarationKind;
  /** Whether the value is an `async` function or arrow. `false` for non-functions and re-exports. */
  isAsync: boolean;
  /** For `export { x } from "./mod"`, the `"./mod"` specifier. `null` otherwise. */
  reexportSource: string | null;
}

/** `clientLoader`-specific metadata, additionally carrying its `hydrate` flag. */
export interface ClientLoaderExportInfo extends RouteExportInfo {
  /** Whether a top-level `clientLoader.hydrate = true` assignment is present. */
  hydrate: boolean;
}

/** An export whose name is not a recognized route-module API (useful for typo detection). */
export interface UnknownExportInfo extends RouteExportInfo {
  /** The exported name (e.g. `"loaer"`). */
  name: string;
}

/**
 * The recognized route-module exports. Each slot holds metadata when present and `null` when
 * absent, so consumers can check existence directly (e.g. `exports.loader !== null`).
 */
export interface RouteModuleExports {
  /** The route component. */
  default: RouteExportInfo | null;
  ErrorBoundary: RouteExportInfo | null;
  HydrateFallback: RouteExportInfo | null;
  loader: RouteExportInfo | null;
  clientLoader: ClientLoaderExportInfo | null;
  action: RouteExportInfo | null;
  clientAction: RouteExportInfo | null;
  middleware: RouteExportInfo | null;
  clientMiddleware: RouteExportInfo | null;
  headers: RouteExportInfo | null;
  links: RouteExportInfo | null;
  meta: RouteExportInfo | null;
  handle: RouteExportInfo | null;
  shouldRevalidate: RouteExportInfo | null;
}

/** Route manifest entry enriched with on-disk location, the outlets it renders, and its exports. */
export interface RouteModuleInfo {
  id: string;
  parentId?: string;
  /** Module path relative to the app directory, as in the route manifest. */
  file: string;
  /** Absolute path to the module on disk. */
  physicalFile: string;
  /** Every `<Outlet>` rendered by this module, in source order. */
  outlets: OutletInfo[];
  /** The recognized route-module exports, keyed by name; `null` slots are absent. */
  exports: RouteModuleExports;
  /** Top-level exports whose names are not recognized route-module APIs. */
  unknownExports: UnknownExportInfo[];
}

/**
 * Analyze every route module's source and return manifest entries enriched with their physical
 * path, the outlets they render, and their recognized exports. This is pure syntax analysis (no
 * type checking).
 */
export function analyzeRouteModules(
  resolved: Pick<ResolvedReactRouterConfig, "appDirectory" | "routes">,
): Record<string, RouteModuleInfo> {
  const result: Record<string, RouteModuleInfo> = {};
  for (const entry of Object.values(resolved.routes)) {
    const physicalFile = resolvePath(resolved.appDirectory, entry.file);
    const analysis = analyzeModuleFile(physicalFile);
    result[entry.id] = {
      id: entry.id,
      ...(entry.parentId === undefined ? {} : { parentId: entry.parentId }),
      file: entry.file,
      physicalFile,
      outlets: analysis.outlets,
      exports: analysis.exports,
      unknownExports: analysis.unknownExports,
    };
  }
  return result;
}

interface ModuleAnalysis {
  outlets: OutletInfo[];
  exports: RouteModuleExports;
  unknownExports: UnknownExportInfo[];
}

function analyzeModuleFile(physicalFile: string): ModuleAnalysis {
  let source: string;
  try {
    source = readFileSync(physicalFile, "utf8");
  } catch {
    return { outlets: [], exports: emptyExports(), unknownExports: [] };
  }
  const { program } = parseSync(physicalFile, source);

  const scope = collectModuleScope(program);
  const { exports, unknownExports } = extractExports(program);
  // Keep the JSX walk fast-path: only traverse the full tree when an Outlet binding exists.
  const outlets =
    scope.outletDirect.size > 0 || scope.outletNamespaces.size > 0
      ? collectOutlets(program, source, scope)
      : [];

  return { outlets, exports, unknownExports };
}

const RECOGNIZED_EXPORT_NAMES = new Set<keyof RouteModuleExports>([
  "default",
  "ErrorBoundary",
  "HydrateFallback",
  "loader",
  "clientLoader",
  "action",
  "clientAction",
  "middleware",
  "clientMiddleware",
  "headers",
  "links",
  "meta",
  "handle",
  "shouldRevalidate",
]);

function emptyExports(): RouteModuleExports {
  return {
    default: null,
    ErrorBoundary: null,
    HydrateFallback: null,
    loader: null,
    clientLoader: null,
    action: null,
    clientAction: null,
    middleware: null,
    clientMiddleware: null,
    headers: null,
    links: null,
    meta: null,
    handle: null,
    shouldRevalidate: null,
  };
}

function extractExports(program: Program): {
  exports: RouteModuleExports;
  unknownExports: UnknownExportInfo[];
} {
  const recognized = new Map<keyof RouteModuleExports, RouteExportInfo>();
  const unknownExports: UnknownExportInfo[] = [];
  let clientLoaderHydrate = false;

  const record = (name: string, info: RouteExportInfo) => {
    if (RECOGNIZED_EXPORT_NAMES.has(name as keyof RouteModuleExports)) {
      recognized.set(name as keyof RouteModuleExports, info);
    } else {
      unknownExports.push({ name, ...info });
    }
  };

  for (const statement of program.body as Statement[]) {
    if (statement.type === "ExportDefaultDeclaration") {
      const { declarationKind, isAsync } = classifyDefaultExport(statement.declaration);
      record("default", {
        span: { start: statement.start, end: statement.end },
        declarationKind,
        isAsync,
        reexportSource: null,
      });
    } else if (statement.type === "ExportNamedDeclaration") {
      const span = { start: statement.start, end: statement.end };
      if (statement.declaration !== null) {
        recordDeclarationExports(statement.declaration, span, record);
      } else {
        const reexportSource = statement.source === null ? null : statement.source.value;
        for (const specifier of statement.specifiers) {
          record(moduleExportName(specifier.exported), {
            span: { start: specifier.start, end: specifier.end },
            declarationKind: "reexport",
            isAsync: false,
            reexportSource,
          });
        }
      }
    } else if (statement.type === "ExportAllDeclaration" && statement.exported !== null) {
      // `export * as ns from "./x"`. Bare `export * from "./x"` has no name and is skipped.
      record(moduleExportName(statement.exported), {
        span: { start: statement.start, end: statement.end },
        declarationKind: "reexport",
        isAsync: false,
        reexportSource: statement.source.value,
      });
    } else if (isClientLoaderHydrateAssignment(statement)) {
      clientLoaderHydrate = true;
    }
  }

  const exports = emptyExports();
  for (const [name, info] of recognized) {
    if (name === "clientLoader") {
      exports.clientLoader = { ...info, hydrate: clientLoaderHydrate };
    } else {
      exports[name] = info;
    }
  }
  return { exports, unknownExports };
}

function recordDeclarationExports(
  declaration: Declaration,
  span: SourceSpan,
  record: (name: string, info: RouteExportInfo) => void,
): void {
  if (declaration.type === "FunctionDeclaration") {
    if (declaration.id !== null) {
      record(declaration.id.name, {
        span,
        declarationKind: "function",
        isAsync: declaration.async,
        reexportSource: null,
      });
    }
  } else if (declaration.type === "ClassDeclaration") {
    if (declaration.id !== null) {
      record(declaration.id.name, {
        span,
        declarationKind: "class",
        isAsync: false,
        reexportSource: null,
      });
    }
  } else if (declaration.type === "VariableDeclaration") {
    for (const declarator of declaration.declarations) {
      if (declarator.id.type !== "Identifier") {
        continue;
      }
      const { declarationKind, isAsync } = classifyInit(declarator.init);
      record(declarator.id.name, { span, declarationKind, isAsync, reexportSource: null });
    }
  }
  // Type-only declarations (TSTypeAliasDeclaration, TSInterfaceDeclaration, ...) are ignored.
}

function classifyDefaultExport(declaration: ExportDefaultDeclaration["declaration"]): {
  declarationKind: ExportDeclarationKind;
  isAsync: boolean;
} {
  switch (declaration.type) {
    case "FunctionDeclaration":
    case "FunctionExpression":
      return { declarationKind: "function", isAsync: declaration.async };
    case "ClassDeclaration":
    case "ClassExpression":
      return { declarationKind: "class", isAsync: false };
    case "ArrowFunctionExpression":
      return { declarationKind: "arrow", isAsync: declaration.async };
    default:
      return { declarationKind: "expression", isAsync: false };
  }
}

function classifyInit(init: Expression | null): {
  declarationKind: ExportDeclarationKind;
  isAsync: boolean;
} {
  if (init === null) {
    return { declarationKind: "variable", isAsync: false };
  }
  switch (init.type) {
    case "ArrowFunctionExpression":
      return { declarationKind: "arrow", isAsync: init.async };
    case "FunctionExpression":
      return { declarationKind: "function", isAsync: init.async };
    case "ClassExpression":
      return { declarationKind: "class", isAsync: false };
    default:
      return { declarationKind: "variable", isAsync: false };
  }
}

/** Detect a top-level `clientLoader.hydrate = true` (tolerating `as const` / `satisfies`). */
function isClientLoaderHydrateAssignment(statement: Statement): boolean {
  if (statement.type !== "ExpressionStatement") {
    return false;
  }
  const expression = statement.expression;
  if (expression.type !== "AssignmentExpression" || expression.operator !== "=") {
    return false;
  }
  const left = expression.left;
  if (left.type !== "MemberExpression" || left.computed) {
    return false;
  }
  if (left.object.type !== "Identifier" || left.object.name !== "clientLoader") {
    return false;
  }
  if (left.property.type !== "Identifier" || left.property.name !== "hydrate") {
    return false;
  }
  return isTrueLiteral(expression.right);
}

function isTrueLiteral(expression: Expression): boolean {
  let node: Expression = expression;
  while (node.type === "TSAsExpression" || node.type === "TSSatisfiesExpression") {
    node = node.expression;
  }
  return node.type === "Literal" && node.value === true;
}

function moduleExportName(name: ModuleExportName): string {
  return name.type === "Identifier" ? name.name : name.value;
}

interface ModuleScope {
  readonly outletDirect: Set<string>;
  readonly outletNamespaces: Set<string>;
  readonly localAliases: Map<string, SourceSpan>;
  readonly exportedNames: Set<string>;
}

function collectOutlets(program: Program, source: string, scope: ModuleScope): OutletInfo[] {
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
