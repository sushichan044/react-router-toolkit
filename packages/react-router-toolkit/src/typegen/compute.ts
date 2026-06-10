import { basename, dirname, extname, join, relative } from "pathe";

import type { RouteModuleInfo } from "../schemas";

/** Directory (relative to the project root) that `typegen` writes generated type files into. */
export const TYPEGEN_ROOT_DIR = ".react-router-toolkit/types";

/** Name of the per-directory folder holding generated route type modules. */
export const TYPEGEN_DIR_NAME = "+toolkit-types";

/** Name of the type each generated module exports. */
export const NEAREST_OUTLET_CONTEXT_TYPE = "NearestOutletContext";

/**
 * What a parent route's `<Outlet>`s collectively pass as context, derived purely from
 * `RouteModuleInfo` (no file access). This is the single source of truth for both typegen (which
 * turns each case into the generated `NearestOutletContext` body) and lint rules (which map the
 * cases to diagnostics), so the two can never disagree about what a route receives.
 *
 * - `"type"`: every Outlet passes the same exported local type alias — importable by descendants.
 * - `"bare"`: every Outlet is `<Outlet />` (no context, no spread) — context is always `undefined`.
 * - `"none"`: the parent renders no Outlet at all (unanalyzable parent; a rendered child implies an
 *   Outlet exists somewhere we could not see).
 * - `"untyped"`: context is passed but no Outlet resolves to a usable named type yet.
 * - `"ambiguous"`: the Outlets disagree (multiple importable types, or a mix of typed and untyped).
 */
export type ParentOutletContextResolution =
  | { kind: "type"; name: string }
  | { kind: "bare" }
  | { kind: "none" }
  | { kind: "untyped" }
  | { kind: "ambiguous" };

export function resolveParentOutletContext(parent: RouteModuleInfo): ParentOutletContextResolution {
  const outlets = parent.outlets;
  if (outlets.length === 0) {
    return { kind: "none" };
  }

  // React Router resets context at every Outlet, so only the immediate parent's Outlets matter.
  const importableNames = [
    ...new Set(
      outlets.flatMap((outlet) =>
        outlet.annotation?.type.localTypeAlias?.exported === true
          ? [outlet.annotation.type.text]
          : [],
      ),
    ),
  ];

  if (importableNames.length > 1) {
    return { kind: "ambiguous" };
  }

  if (importableNames.length === 0) {
    const everyOutletIsBare = outlets.every((outlet) => !outlet.passesContext && !outlet.hasSpread);
    return everyOutletIsBare ? { kind: "bare" } : { kind: "untyped" };
  }

  // The single importable name must be passed by *every* Outlet; otherwise the runtime type is a
  // union we will not guess.
  const name = importableNames[0]!;
  const everyOutletPassesName = outlets.every((outlet) => outlet.annotation?.type.text === name);
  return everyOutletPassesName ? { kind: "type", name } : { kind: "ambiguous" };
}

/** One generated file: where it lives (relative to the project root) and its exact content. */
export interface TypegenTarget {
  /** Path of the generated file, relative to the project root (POSIX separators). */
  outputFile: string;
  /** Expected full content of the generated file. */
  expectedContent: string;
}

/**
 * The module specifier a route file uses to import its generated types: `./+toolkit-types/<route
 * file basename>`. Resolvable from the route file itself once the project's tsconfig maps the
 * typegen output via `rootDirs` (mirroring React Router's own `.react-router/types` setup).
 */
export function toolkitTypesSpecifier(physicalFile: string): string {
  return `./${TYPEGEN_DIR_NAME}/${basename(physicalFile, extname(physicalFile))}`;
}

/**
 * What one route _registration_ of a module file receives from its nearest `<Outlet>`. One file can
 * be registered under several route ids with different parents (`route("a", "x.tsx")` and
 * `route("b", "x.tsx")`), so any per-file decision must aggregate every registration.
 */
type RegistrationContext =
  /** The parent passes a single exported type alias. */
  | { kind: "import"; parentFile: string; name: string }
  /** No context can ever arrive: the route has no parent, or the parent's Outlets are all bare. */
  | { kind: "undefined" }
  /** The parent's Outlets disagree; the developer must annotate manually. */
  | { kind: "ambiguous" }
  /** Not statically determinable (no analyzable Outlet, or context without a usable named type). */
  | { kind: "indeterminate" };

function resolveRegistrationContext(
  route: RouteModuleInfo,
  routeModules: Record<string, RouteModuleInfo>,
): RegistrationContext {
  if (route.parentId === undefined) {
    // Not rendered through any <Outlet> (the root route), so there is no context.
    return { kind: "undefined" };
  }
  const parent = routeModules[route.parentId];
  if (parent === undefined) {
    return { kind: "indeterminate" };
  }
  const resolution = resolveParentOutletContext(parent);
  switch (resolution.kind) {
    case "type": {
      return { kind: "import", parentFile: parent.physicalFile, name: resolution.name };
    }
    case "bare": {
      return { kind: "undefined" };
    }
    case "ambiguous": {
      return { kind: "ambiguous" };
    }
    case "none":
    case "untyped": {
      return { kind: "indeterminate" };
    }
  }
}

/** Aggregate classification of a module file's `NearestOutletContext` across its registrations. */
export type ModuleOutletContext =
  /** At least one registration receives an importable type (the generated union is precise). */
  | "typed"
  /** Every registration receives `undefined` at runtime — calling `useOutletContext` is a misuse. */
  | "undefined"
  /** Some registration's parent passes disagreeing contexts. */
  | "ambiguous"
  /** Some registration's context is not statically determinable. */
  | "indeterminate";

/**
 * Classify what `NearestOutletContext` means for a module file, considering **every** route
 * registration of that file. Shared by typegen (which renders the matching type body) and the lint
 * rules (which map the classification to diagnostics), so the two can never disagree.
 */
export function classifyModuleOutletContext(
  registrations: readonly RouteModuleInfo[],
  routeModules: Record<string, RouteModuleInfo>,
): ModuleOutletContext {
  const kinds = new Set(
    registrations.map((route) => resolveRegistrationContext(route, routeModules).kind),
  );
  if (kinds.has("ambiguous")) {
    return "ambiguous";
  }
  if (kinds.has("indeterminate")) {
    return "indeterminate";
  }
  return kinds.has("import") ? "typed" : "undefined";
}

/**
 * Compute every file `typegen` should generate for the project — exactly one per route module file,
 * so `./+toolkit-types/<route>` is always importable regardless of what the parent currently
 * passes. This mirrors React Router's own typegen, which annotates every file in the route manifest
 * (layouts and the root route included). Pure: derives everything from the already-analyzed route
 * modules without touching the filesystem.
 *
 * Each generated module exports `NearestOutletContext`, following
 * {@link classifyModuleOutletContext}: the union of the parents' exported types (plus `undefined`
 * for registrations that receive nothing) when every registration is determinable, `undefined` when
 * nothing is ever passed, and `unknown` otherwise.
 */
export function computeTypegenTargets(
  root: string,
  routeModules: Record<string, RouteModuleInfo>,
): TypegenTarget[] {
  // outputFile → the context each registration of that file receives.
  const contexts = new Map<string, RegistrationContext[]>();
  for (const route of Object.values(routeModules)) {
    const outputFile = join(
      TYPEGEN_ROOT_DIR,
      relative(root, dirname(route.physicalFile)),
      TYPEGEN_DIR_NAME,
      `${basename(route.physicalFile, extname(route.physicalFile))}.d.ts`,
    );
    const list = contexts.get(outputFile) ?? [];
    list.push(resolveRegistrationContext(route, routeModules));
    contexts.set(outputFile, list);
  }

  return [...contexts.entries()].map(([outputFile, registrationContexts]) => ({
    outputFile,
    expectedContent:
      `// Generated by \`react-router-toolkit typegen\`. Do not edit.\n` +
      `export type ${NEAREST_OUTLET_CONTEXT_TYPE} = ` +
      `${contextTypeBody(registrationContexts, join(root, dirname(outputFile)))};\n`,
  }));
}

/** The right-hand side of the generated `NearestOutletContext` alias for one module file. */
function contextTypeBody(contexts: readonly RegistrationContext[], generatedDir: string): string {
  if (contexts.some((c) => c.kind === "ambiguous" || c.kind === "indeterminate")) {
    return "unknown";
  }
  const parts = new Set<string>(
    contexts.map((c) => {
      if (c.kind !== "import") {
        return "undefined";
      }
      const importPath = toImportTypeSpecifier(relative(generatedDir, c.parentFile));
      return `import(${JSON.stringify(importPath)}).${c.name}`;
    }),
  );
  return [...parts].sort().join(" | ");
}

/**
 * Turn a relative file path into the specifier used inside the generated `import("...")` type
 * query. The source extension is rewritten to `.js`, which TypeScript maps back to `.ts`/`.tsx`
 * under both `bundler` and `node16`/`nodenext` module resolution.
 */
function toImportTypeSpecifier(relativePath: string): string {
  const specifier = relativePath.replace(/\.(?:tsx?|jsx?|mts|cts|mjs|cjs)$/, ".js");
  return specifier.startsWith(".") ? specifier : `./${specifier}`;
}
