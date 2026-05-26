# react-router-routing-toolkit

Load a React Router (Framework Mode) `app/routes.ts` file the same way React
Router does at build time, and inspect the result as a typed route tree. Built
on Vite's ModuleRunner so the user project's `vite.config.ts`, aliases, and
plugins all stay consistent with what the production build sees.

Use it when you need to ask questions about a React Router project's routing
that are awkward to answer from inside React Router itself — typically when
writing static-analysis tooling like linter plugins:

- enumerate every reachable URL pattern,
- ask which layouts surround a given URL,
- look up which route module renders a given route id,
- reverse-look a file path back to its route entry.

## Install

```sh
pnpm add -D react-router-routing-toolkit
```

`vite` and `react-router` must already be installed in the host project
(declared as peer dependencies):

```jsonc
{
  "peerDependencies": {
    "react-router": ">=7.0.0",
    "vite": "^7.0.0 || ^8.0.0",
  },
}
```

The `routes.ts` file is always resolved at `${root}/app/routes.ts`, and
`app/root.tsx` (or another supported extension) is required — React Router's
own framework mode enforces the same convention. Customising these locations
is not supported.

## Quick start

```ts
import {
  buildRouteIndex,
  getRenderChain,
  listRoutes,
  loadRouteTree,
  matchUrl,
} from "react-router-routing-toolkit";

const tree = await loadRouteTree({ root: process.cwd() });

// Walk the tree directly (children are nested).
console.log(tree.kind, tree.id); // "layout", "root"

// Every terminal route the app exposes, sorted by URL pattern.
for (const terminal of listRoutes(tree)) {
  console.log(terminal.fullPath, "→", terminal.file);
}

// Build a flat id → node index for fast lookups.
const index = buildRouteIndex(tree);

// Resolve a specific URL.
const match = matchUrl(tree, "/concerts/tokyo");
if (match) {
  console.log("terminal file:", match.terminal.file);
  console.log("params:", match.params);
  console.log(
    "render chain:",
    match.renderChain.map((n) => n.file),
  );
}

// Render chain for any node (root → leaf).
const chain = getRenderChain(index, "concerts/city");
console.log(chain.map((n) => n.file));
```

## Concepts

The toolkit produces a single-rooted **route tree**. The root is always a
synthesized `LayoutRouteNode` representing `app/root.tsx`; every entry the
user wrote in `routes.ts` becomes its descendant. This mirrors what React
Router does internally and makes the render chain of every page easy to
reason about — it always begins at the root layout.

### `RouteNode` — discriminated union

Each node carries a `kind` discriminator:

| `kind`     | Has `path`?            | Has `children`? | Helper produced by                  |
| ---------- | ---------------------- | --------------- | ----------------------------------- |
| `"index"`  | only via `prefix(...)` | no              | `index(file)`                       |
| `"layout"` | no                     | yes             | `layout(file, children)` and `root` |
| `"leaf"`   | yes                    | no              | `route(path, file)`                 |
| `"branch"` | yes                    | yes             | `route(path, file, children)`       |

Common fields on every node: `id`, `parentId`, `file`, `fullPath`, `params`,
`caseSensitive`.

Helper unions are exported for narrowing:

- `TerminalRouteNode = IndexRouteNode | LeafRouteNode` (matchable as a leaf)
- `WrapperRouteNode = LayoutRouteNode | BranchRouteNode` (wraps children)
- `PathfulRouteNode` / `PathlessRouteNode`

Type guards `isTerminal`, `isWrapper`, `isPathful`, `isPathless` are exported
for narrowing in plain expressions.

### Tree vs. Index

- **`RouteTree`** (`= RouteNode`) — the natural shape for walking or rendering
  hierarchies. Pass it to `listRoutes`, `matchUrl`.
- **`RouteIndex`** (`= ReadonlyMap<string, RouteNode>`) — fast id lookup,
  derived from a tree with `buildRouteIndex(tree)`. Pass it to `getRouteById`,
  `findByFile`, `getRenderChain`.

Build the index once and reuse it across many lookups.

## API

### High-level

#### `loadRouteTree(options?): Promise<RouteTree>`

One-shot pipeline: evaluate `app/routes.ts`, build the tree, return it.
Throws `RouteEvaluationError`, `RouteValidationError`, or
`RouteManifestError` on failure.

### Low-level

#### `evaluateRoutesFile(options?): Promise<readonly RouteConfigEntry[]>`

Spin up a Vite dev server, run `app/routes.ts` through the SSR ModuleRunner,
and return the array its default export resolves to. The server is disposed
automatically through `await using`.

#### `buildRouteTree(entries, options): RouteTree`

Depth-first traversal of the `RouteConfigEntry[]` tree. Synthesizes
`app/root.tsx` (resolved through `options.appDirectory`) as the single
top-level layout, with every input entry nested as its child.

### Utilities

| Function                    | Purpose                                                             |
| --------------------------- | ------------------------------------------------------------------- |
| `buildRouteIndex(tree)`     | Convert a tree to a `ReadonlyMap<string, RouteNode>` for id lookup. |
| `listRoutes(tree)`          | Every terminal node, sorted by `fullPath`.                          |
| `matchUrl(tree, url)`       | Match a URL using `react-router`'s own `matchRoutes`.               |
| `getRouteById(index, id)`   | Throwing variant of `index.get(id)`.                                |
| `findByFile(index, file)`   | Reverse-lookup a node by its `file` field.                          |
| `getRenderChain(index, id)` | Root → leaf chain of `RouteNode`s — the actual render stack.        |
| `isTerminal(node)`          | Narrow to `TerminalRouteNode`.                                      |
| `isWrapper(node)`           | Narrow to `WrapperRouteNode`.                                       |
| `isPathful(node)`           | Narrow to `PathfulRouteNode`.                                       |
| `isPathless(node)`          | Narrow to `PathlessRouteNode`.                                      |

### Options

```ts
interface LoadRoutesOptions {
  /** Vite `root`. Defaults to `process.cwd()`. */
  root?: string;
}

interface BuildRouteTreeOptions {
  /**
   * Absolute path of the application directory (commonly `${root}/app`).
   * Used to normalise file paths and to locate `app/root.{tsx,...}`.
   */
  appDirectory: string;
}
```

### Errors

All errors extend `RouteToolkitError`. The `kind` field discriminates:

- `RouteEvaluationError` (`kind: "evaluation"`) — Vite or the runner failed,
  or the SSR environment is not runnable. Exposes `file` (the routes path).
- `RouteValidationError` (`kind: "validation"`) — the default export is not a
  `RouteConfigEntry[]`.
- `RouteManifestError` (`kind: "manifest"`) — assembling the tree failed:
  two entries resolve to the same id, a user route uses the reserved id
  `"root"`, `app/root.tsx` is missing, or an entry is structurally invalid
  (no `path`, no `index`, no `children`). Exposes `conflictingId` when
  applicable.

## Notes

- **Why a peer dependency on Vite?** `loadRouteTree` spins up a real Vite
  dev server so the user's `vite.config.ts` (aliases, plugins) governs
  module resolution exactly the same way the production build does. Sharing
  one Vite instance avoids version mismatches.
- **`__reactRouterAppDirectory`.** React Router's `getAppDirectory()` helper
  reads this global. The toolkit sets it to `${root}/app` immediately before
  invoking the runner so route definitions that rely on it keep working.
- **HMR is not supported.** Each `loadRouteTree` call starts a fresh Vite
  dev server, evaluates the routes once, and tears it down. Call it again to
  pick up changes.
