import { resolve as resolvePath } from "node:path";

import { create, RealFSProvider } from "@platformatic/vfs";
import type { VirtualFileSystem } from "@platformatic/vfs";
import { parse } from "oxc-parser";
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

// The data shapes produced here are defined as valibot schemas in `schemas.ts` (the schemas are
// the source of truth; these types are inferred from them).
import type {
  ExportDeclarationKind,
  OutletInfo,
  RouteExportInfo,
  RouteModuleExports,
  RouteModuleInfo,
  SourceSpan,
  UnknownExportInfo,
} from "./schemas";
import type { ResolvedReactRouterConfig } from "./vendor/react-router/config/config";

/**
 * Analyze every route module's source and return manifest entries enriched with their physical
 * path, the outlets they render, and their recognized exports. This is pure syntax analysis (no
 * type checking). Modules are read and parsed concurrently, and a file registered under multiple
 * route ids is read and parsed only once.
 *
 * `files` is a filesystem rooted at `resolved.appDirectory`; modules are read via their
 * app-relative `file` path. It defaults to the real filesystem — pass a `MemoryProvider`-backed VFS
 * to analyze sources in tests without touching disk.
 */
export async function analyzeRouteModules(
  resolved: Pick<ResolvedReactRouterConfig, "appDirectory" | "routes">,
  files: VirtualFileSystem = create(new RealFSProvider(resolved.appDirectory), {
    moduleHooks: false,
  }),
): Promise<Record<string, RouteModuleInfo>> {
  const analyses = new Map<string, Promise<ModuleAnalysis>>();
  const analyzeOnce = (file: string, physicalFile: string): Promise<ModuleAnalysis> => {
    let analysis = analyses.get(physicalFile);
    if (analysis === undefined) {
      analysis = analyzeModuleFile(files, file, physicalFile);
      analyses.set(physicalFile, analysis);
    }
    return analysis;
  };

  const entries = await Promise.all(
    Object.values(resolved.routes).map(async (entry): Promise<[string, RouteModuleInfo]> => {
      const physicalFile = resolvePath(resolved.appDirectory, entry.file);
      const analysis = await analyzeOnce(entry.file, physicalFile);
      return [
        entry.id,
        {
          id: entry.id,
          ...(entry.parentId === undefined ? {} : { parentId: entry.parentId }),
          file: entry.file,
          physicalFile,
          fileExists: analysis.fileExists,
          outlets: analysis.outlets,
          exports: analysis.exports,
          unknownExports: analysis.unknownExports,
        },
      ];
    }),
  );
  return Object.fromEntries(entries);
}

interface ModuleAnalysis {
  fileExists: boolean;
  outlets: OutletInfo[];
  exports: RouteModuleExports;
  unknownExports: UnknownExportInfo[];
}

async function analyzeModuleFile(
  files: VirtualFileSystem,
  file: string,
  physicalFile: string,
): Promise<ModuleAnalysis> {
  let source: string;
  try {
    source = await files.promises.readFile(`/${file}`, "utf8");
  } catch {
    return { fileExists: false, outlets: [], exports: emptyExports(), unknownExports: [] };
  }
  const { program } = await parse(physicalFile, source);

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

  return { fileExists: true, outlets, exports, unknownExports };
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
      case "TSTypeAliasDeclaration": {
        scope.localAliases.set(statement.id.name, { start: statement.start, end: statement.end });
        break;
      }
      case "FunctionDeclaration": {
        registerComponent(scope, statement.id?.name, statement.body);
        break;
      }
      case "VariableDeclaration": {
        registerVariableComponents(scope, statement);
        break;
      }
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
            if (statement.source === null && specifier.local.type === "Identifier") {
              scope.exportedNames.add(specifier.local.name);
            }
          }
        }
        break;
      }
      case "ExportAllDeclaration": {
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
      }
      case "ExpressionStatement": {
        if (isClientLoaderHydrateAssignment(statement)) {
          clientLoaderHydrate = true;
        }
        break;
      }
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
    case "FunctionExpression": {
      return { declarationKind: "function", isAsync: declaration.async };
    }
    case "ClassDeclaration":
    case "ClassExpression": {
      return { declarationKind: "class", isAsync: false };
    }
    case "ArrowFunctionExpression": {
      return { declarationKind: "arrow", isAsync: declaration.async };
    }
    default: {
      return { declarationKind: "expression", isAsync: false };
    }
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
    case "ArrowFunctionExpression": {
      return { declarationKind: "arrow", isAsync: init.async };
    }
    case "FunctionExpression": {
      return { declarationKind: "function", isAsync: init.async };
    }
    case "ClassExpression": {
      return { declarationKind: "class", isAsync: false };
    }
    default: {
      return { declarationKind: "variable", isAsync: false };
    }
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
