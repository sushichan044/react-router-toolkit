# react-router-routing-toolkit

Load a React Router (Framework Mode) `app/routes.ts` file the same way React
Router does at build time, and inspect the result as a flat, structured route
manifest. Built on Vite's ModuleRunner so the user project's
`vite.config.ts`, aliases, and plugins all stay consistent with what the
production build sees.

Use it when you need to ask questions about a React Router project's routing
that are awkward to answer from inside React Router itself:

- enumerate every reachable URL pattern,
- ask which layout files surround a given URL,
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

The `routes.ts` file is always resolved at `${root}/app/routes.ts`. Customising
that location is not supported.

## Quick start

```ts
import { createRouteManifest, listRoutes, matchUrl } from "react-router-routing-toolkit";

const manifest = await createRouteManifest({
  root: process.cwd(),
});

// Every leaf URL the app exposes, sorted by pattern.
for (const leaf of listRoutes(manifest)) {
  console.log(leaf.urlPattern, "→", leaf.file);
  console.log(
    "  layouts:",
    leaf.layoutChain.map((c) => c.file),
  );
}

// Resolve a specific URL.
const match = matchUrl(manifest, "/concerts/tokyo");
if (match) {
  console.log("leaf file:", match.leaf.file);
  console.log("params:", match.params);
  console.log(
    "layout chain:",
    match.layoutChain.map((c) => c.file),
  );
}
```

## API

### High-level

#### `createRouteManifest(options?): Promise<RouteManifest>`

One-shot pipeline: evaluate `app/routes.ts`, flatten the tree, return a
`ReadonlyMap` keyed by route id. Throws `RouteEvaluationError`,
`RouteValidationError`, or `RouteManifestError` on failure.

### Low-level

#### `evaluateRoutesFile(options?): Promise<RouteConfigEntry[]>`

Spin up a Vite dev server, run `app/routes.ts` through the SSR ModuleRunner,
and return the array its default export resolves to. The server is disposed
automatically through `await using`.

#### `flattenToManifest(entries): RouteManifest`

Depth-first traversal of the `RouteConfigEntry[]` tree. Each parent appears in
the resulting map before its children. Assigns ids using
`entry.id ?? posix.normalize(stripExtension(entry.file))` and joins parent
paths to produce `fullPath`.

### Utilities

| Function                         | Purpose                                                                    |
| -------------------------------- | -------------------------------------------------------------------------- |
| `listRoutes(manifest)`           | Every leaf route, sorted by `urlPattern`.                                  |
| `matchUrl(manifest, url)`        | Match a URL against the manifest using `react-router`'s own `matchRoutes`. |
| `getLayoutChain(manifest, id)`   | Root → leaf chain of `LayoutChainEntry`s.                                  |
| `findByFile(manifest, filePath)` | Reverse-lookup an entry by its `file` field.                               |
| `getRouteById(manifest, id)`     | Throwing variant of `manifest.get(id)`.                                    |

### Options

```ts
interface CreateRouteManifestOptions {
  /** Defaults to Vite's automatic config search. Pass `false` to skip. */
  configFile?: string | false;
  /** Vite `root`. Defaults to `process.cwd()`. */
  root?: string;
}
```

### Errors

All errors extend `RouteToolkitError`. The `kind` field discriminates:

- `RouteEvaluationError` (`kind: "evaluation"`) — Vite or the runner failed,
  or the SSR environment is not runnable. Exposes `file` (the routes path).
- `RouteValidationError` (`kind: "validation"`) — the default export is not a
  `RouteConfigEntry[]`.
- `RouteManifestError` (`kind: "manifest"`) — flattening failed (e.g. two
  entries resolve to the same id). Exposes `conflictingId` when applicable.

## Notes

- **Why a peer dependency on Vite?** `createRouteManifest` spins up a real
  Vite dev server so the user's `vite.config.ts` (aliases, plugins) governs
  module resolution exactly the same way the production build does. Sharing
  one Vite instance avoids version mismatches.
- **`__reactRouterAppDirectory`.** React Router's `getAppDirectory()` helper
  reads this global. The toolkit sets it to `${root}/app` immediately before
  invoking the runner so route definitions that rely on it keep working.
- **HMR is not supported.** Each `createRouteManifest` call starts a fresh
  Vite dev server, evaluates the routes once, and tears it down. Call it
  again to pick up changes.
