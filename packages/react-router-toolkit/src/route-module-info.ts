import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";

import { parseSync } from "oxc-parser";
import type {
  Declaration,
  Expression,
  ExportDefaultDeclaration,
  Function as FunctionNode,
  FunctionBody,
  JSXAttribute,
  JSXOpeningElement,
  ModuleExportName,
  Node,
  Program,
  Statement,
  VariableDeclaration,
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

  // A single pass over the module's top level classifies the exports (for `RouteModuleExports`) and
  // collects what the outlet walk needs (Outlet bindings, local components, exported names, and the
  // default export's declaration). Both views come from the same traversal, so "what is exported"
  // and "where is the default export" are decided once.
  const { scope, exports, unknownExports, defaultDeclaration } = collectModule(program);
  // Keep the JSX walk fast-path: only traverse the full tree when an Outlet binding exists.
  const outlets =
    scope.outletDirect.size > 0 || scope.outletNamespaces.size > 0
      ? collectOutlets(defaultDeclaration, source, scope)
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

interface CollectedModule {
  scope: ModuleScope;
  exports: RouteModuleExports;
  unknownExports: UnknownExportInfo[];
  /** The default export's declaration node, used to resolve the route component's body. */
  defaultDeclaration: ExportDefaultDeclaration["declaration"] | null;
}

/**
 * Walk the module's top-level statements once, deriving both the recognized exports (for
 * `RouteModuleExports`) and the scope the outlet walk needs. The export classification is the
 * single source of truth for which names are exported and which declaration is the default, so the
 * outlet walk reuses it instead of re-scanning the program.
 */
function collectModule(program: Program): CollectedModule {
  const scope: ModuleScope = {
    outletDirect: new Set(),
    outletNamespaces: new Set(),
    localAliases: new Map(),
    exportedNames: new Set(),
    localComponents: new Map(),
  };
  const recognized = new Map<keyof RouteModuleExports, RouteExportInfo>();
  const unknownExports: UnknownExportInfo[] = [];
  let clientLoaderHydrate = false;
  let defaultDeclaration: ExportDefaultDeclaration["declaration"] | null = null;

  const record = (name: string, info: RouteExportInfo) => {
    if (RECOGNIZED_EXPORT_NAMES.has(name as keyof RouteModuleExports)) {
      recognized.set(name as keyof RouteModuleExports, info);
    } else {
      unknownExports.push({ name, ...info });
    }
  };

  for (const statement of program.body as Statement[]) {
    switch (statement.type) {
      case "ImportDeclaration": {
        const source = statement.source.value;
        if (source !== "react-router" && source !== "react-router-dom") {
          break;
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
        break;
      }
      case "TSTypeAliasDeclaration":
        scope.localAliases.set(statement.id.name, { start: statement.start, end: statement.end });
        break;
      case "FunctionDeclaration":
        registerComponent(scope, statement.id?.name, statement.body);
        break;
      case "VariableDeclaration":
        registerVariableComponents(scope, statement);
        break;
      case "ExportDefaultDeclaration": {
        defaultDeclaration = statement.declaration;
        const { declarationKind, isAsync } = classifyDefaultExport(statement.declaration);
        record("default", {
          span: { start: statement.start, end: statement.end },
          declarationKind,
          isAsync,
          reexportSource: null,
        });
        break;
      }
      case "ExportNamedDeclaration": {
        const span = { start: statement.start, end: statement.end };
        if (statement.declaration !== null) {
          recordDeclarationExports(statement.declaration, span, record);
          registerExportedDeclaration(scope, statement.declaration);
        } else {
          const reexportSource = statement.source === null ? null : statement.source.value;
          for (const specifier of statement.specifiers) {
            record(moduleExportName(specifier.exported), {
              span: { start: specifier.start, end: specifier.end },
              declarationKind: "reexport",
              isAsync: false,
              reexportSource,
            });
            if (specifier.local.type === "Identifier") {
              scope.exportedNames.add(specifier.local.name);
            }
          }
        }
        break;
      }
      case "ExportAllDeclaration":
        // `export * as ns from "./x"`. Bare `export * from "./x"` has no name and is skipped.
        if (statement.exported !== null) {
          record(moduleExportName(statement.exported), {
            span: { start: statement.start, end: statement.end },
            declarationKind: "reexport",
            isAsync: false,
            reexportSource: statement.source.value,
          });
        }
        break;
      case "ExpressionStatement":
        if (isClientLoaderHydrateAssignment(statement)) {
          clientLoaderHydrate = true;
        }
        break;
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
  return { scope, exports, unknownExports, defaultDeclaration };
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

/** The body of a component function: a block statement, or an arrow's expression body. */
type ComponentBody = FunctionBody | Expression;

interface ModuleScope {
  readonly outletDirect: Set<string>;
  readonly outletNamespaces: Set<string>;
  readonly localAliases: Map<string, SourceSpan>;
  readonly exportedNames: Set<string>;
  /**
   * Top-level component declarations keyed by their local name (function declarations and `const X
   * = () => …` / `const X = function () {…}`), mapped to their function body. Used to follow a
   * route's render tree from its default export into local helper components.
   */
  readonly localComponents: Map<string, ComponentBody>;
}

/**
 * Collect only the `<Outlet>`s that the route actually renders. React Router renders a module's
 * default export as the route component, so an Outlet belongs to the route only when it is reached
 * from the default export — either directly, or through a non-exported local component the default
 * export renders. Outlets declared in exported (non-default) components or in unreachable local
 * components are intentionally ignored here; they do not pass context to child routes.
 */
function collectOutlets(
  defaultDeclaration: ExportDefaultDeclaration["declaration"] | null,
  source: string,
  scope: ModuleScope,
): OutletInfo[] {
  const defaultExportBody = resolveDefaultExportBody(defaultDeclaration, scope);
  if (defaultExportBody === null) {
    // No analyzable default export (anonymous re-export, HOC wrapper, class, etc.). Be conservative
    // and claim no outlets rather than guess from unreachable code.
    return [];
  }
  return collectReachableOutlets(defaultExportBody, source, scope, new Set());
}

/**
 * Record the scope facts carried by an exported declaration: its name is exported (so the outlet
 * walk will not follow it as a local component), and a declared component or type alias is
 * registered. Re-export specifiers are handled by the caller, which has the local name.
 */
function registerExportedDeclaration(scope: ModuleScope, declaration: Declaration): void {
  if (declaration.type === "TSTypeAliasDeclaration") {
    scope.localAliases.set(declaration.id.name, {
      start: declaration.start,
      end: declaration.end,
    });
    scope.exportedNames.add(declaration.id.name);
  } else if (declaration.type === "FunctionDeclaration") {
    if (declaration.id !== null) {
      scope.exportedNames.add(declaration.id.name);
    }
    registerComponent(scope, declaration.id?.name, declaration.body);
  } else if (declaration.type === "VariableDeclaration") {
    for (const declarator of declaration.declarations) {
      if (declarator.id.type === "Identifier") {
        scope.exportedNames.add(declarator.id.name);
      }
    }
    registerVariableComponents(scope, declaration);
  }
}

/** Record a named function declaration as a local component, when it has a body. */
function registerComponent(
  scope: ModuleScope,
  name: string | undefined,
  body: FunctionBody | null,
): void {
  if (name !== undefined && body !== null) {
    scope.localComponents.set(name, body);
  }
}

/** Record any `const X = () => …` / `const X = function () {…}` declarators as local components. */
function registerVariableComponents(scope: ModuleScope, declaration: VariableDeclaration): void {
  for (const declarator of declaration.declarations) {
    if (declarator.id.type !== "Identifier") {
      continue;
    }
    const body = declarator.init === null ? null : extractFunctionBody(declarator.init);
    if (body !== null) {
      scope.localComponents.set(declarator.id.name, body);
    }
  }
}

/** The function body of an arrow/function expression, or `null` for any other initializer. */
function extractFunctionBody(init: Expression): ComponentBody | null {
  if (init.type === "ArrowFunctionExpression") {
    return init.body;
  }
  if (init.type === "FunctionExpression") {
    return (init as FunctionNode).body;
  }
  return null;
}

/**
 * Resolve the body of the module's default-export component from its declaration node, or `null`
 * when it cannot be analyzed statically (no default export, an HOC/`memo(...)` wrapper, a class, or
 * a re-exported name not declared in this module).
 */
function resolveDefaultExportBody(
  declaration: ExportDefaultDeclaration["declaration"] | null,
  scope: ModuleScope,
): ComponentBody | null {
  if (declaration === null) {
    return null;
  }
  if (declaration.type === "FunctionDeclaration") {
    return (declaration as FunctionNode).body;
  }
  if (declaration.type === "FunctionExpression") {
    return (declaration as FunctionNode).body;
  }
  if (declaration.type === "ParenthesizedExpression") {
    return resolveDefaultExportBody(declaration.expression, scope);
  }
  if (declaration.type === "ArrowFunctionExpression") {
    return declaration.body;
  }
  if (declaration.type === "Identifier") {
    return scope.localComponents.get(declaration.name) ?? null;
  }
  return null;
}

/**
 * Walk a component body and collect the `<Outlet>`s it renders, following references to
 * non-exported local components (the only components whose render output is unambiguously this
 * route's). The visited set guards against mutually-recursive components.
 */
function collectReachableOutlets(
  body: ComponentBody,
  source: string,
  scope: ModuleScope,
  visited: Set<string>,
): OutletInfo[] {
  const outlets: OutletInfo[] = [];
  walkReachableBody(body, (node) => {
    if (node.type !== "JSXOpeningElement") {
      return;
    }
    if (isOutletName(node.name, scope)) {
      outlets.push(buildOutletInfo(node, source, scope));
      return;
    }
    if (node.name.type !== "JSXIdentifier") {
      return;
    }
    const name = node.name.name;
    if (scope.localComponents.has(name) && !scope.exportedNames.has(name) && !visited.has(name)) {
      visited.add(name);
      outlets.push(
        ...collectReachableOutlets(scope.localComponents.get(name)!, source, scope, visited),
      );
    }
  });
  return outlets;
}

function walkReachableBody(node: unknown, visit: (node: Node) => void): void {
  if (Array.isArray(node)) {
    for (const item of node) {
      walkReachableBody(item, visit);
    }
    return;
  }
  if (node === null || typeof node !== "object") {
    return;
  }
  if (typeof (node as { type?: unknown }).type === "string") {
    const astNode = node as Node;
    if (isFunctionOrClassNode(astNode)) {
      return;
    }
    visit(astNode);
  }
  for (const [key, value] of Object.entries(node)) {
    if (key !== "parent") {
      walkReachableBody(value, visit);
    }
  }
}

function isFunctionOrClassNode(node: Node): boolean {
  return (
    node.type === "FunctionDeclaration" ||
    node.type === "FunctionExpression" ||
    node.type === "ArrowFunctionExpression" ||
    node.type === "ClassDeclaration" ||
    node.type === "ClassExpression"
  );
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
