# react-router-toolkit

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
- reverse-look a file path back to its route entry,
- assert routing invariants in your app's own test suite (see
  [Testing your routes](#testing-your-routes)).

## Install

```sh
pnpm add -D react-router-toolkit
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

## Testing your routes

When `app/routes.ts` is hand-written, its structure is code you can regress. The recipes below
cover the common invariants with two primitives: `flattenRouteTree` (every URL pattern → page file
and layout chain) and `matchRoute` (a concrete URL → the route that would render it, with React
Router's real matching semantics).

### Setup: import `routes.ts` directly

Inside the app's own test suite there is no need for `loadRoutes` (that is for external tools
running outside the app's Vite config). `routes.ts` is a normal module — import it and await it,
since `RouteConfig` may be a promise:

```ts
import { describe, expect, it } from "vitest";

import routeConfig from "../app/routes";

const routes = await Promise.resolve(routeConfig);
```

### Snapshot every URL pattern

Catches accidentally dropped or re-parented routes in refactors. `flattenRouteTree` also throws
`RouteLayoutConflictError` when two routes resolve to the same URL, so duplicates fail this test
for free:

```ts
import { flattenRouteTree } from "react-router-toolkit";

it("exposes the expected URL patterns", () => {
  expect(Object.keys(flattenRouteTree(routes)).sort()).toMatchSnapshot();
});
```

### Migrate off file-based routing with a parity test

When replacing `flatRoutes()` with a hand-written config, assert both expose the same URLs with
the same layout nesting, then migrate, then delete the fs-routes side:

```ts
import { flatRoutes } from "@react-router/fs-routes";
import { flattenRouteTree } from "react-router-toolkit";

it("hand-written routes mirror the fs-routes structure", async () => {
  const fsRoutes = await flatRoutes();

  expect(flattenRouteTree(routes)).toStrictEqual(flattenRouteTree(fsRoutes));
});
```

### Cover an external path registry

When another system (codegen output, a sitemap, an API contract) declares paths your app must
serve, assert each one matches a route. `matchRoute` matches concrete URLs, so substitute foreign
placeholder syntax (here `[param]`) with a dummy value — converting to a matchable URL is the
caller's job:

```ts
import { matchRoute } from "react-router-toolkit";

import { PAGE_REGISTRY } from "../generated/pages";

it("implements every /reserve page in the registry", () => {
  const keys = Object.keys(PAGE_REGISTRY).filter((key) => key.startsWith("/reserve"));

  for (const key of keys) {
    const pathname = key.replace(/\[[^\]]+\]/g, "dummy");
    expect(matchRoute(routes, pathname), `no route serves ${key}`).not.toBeNull();
  }
});
```

### Assert layout chains

`flattenRouteTree` keeps URL patterns verbatim (`/reserve/:id`), so prefix-filtering its keys
covers every route under a section:

```ts
import { flattenRouteTree } from "react-router-toolkit";

it("wraps every /reserve page in the navigation layout", () => {
  const entries = Object.entries(flattenRouteTree(routes));

  for (const [url, info] of entries.filter(([url]) => url.startsWith("/reserve"))) {
    expect(info.layouts, url).toContain("routes/navi-layout.tsx");
  }
});
```

For a single URL, `matchRoute(routes, "/reserve/customers/c1").layouts` gives the same chain.

### Check that every route file exists

```ts
import { fileURLToPath } from "node:url";

import { findMissingRouteFiles } from "react-router-toolkit";

it("references only route files that exist", async () => {
  const appDirectory = fileURLToPath(new URL("../app", import.meta.url));

  expect(await findMissingRouteFiles(routes, appDirectory)).toStrictEqual([]);
});
```

Notes: `matchRoute` expects an app-relative pathname — strip any `basename` first. Trailing
slashes are tolerated the same way React Router tolerates them at runtime (`/about/` matches
`about`).

## CLI: `react-router-toolkit typegen`

Generates one type module per route module into `.react-router-toolkit/types/`, mirroring the
project layout, so every route can always import `./+toolkit-types/<route>`. Each module exports
`NearestOutletContext` — the type of what the route's nearest parent `<Outlet>` passes:

- the parent's exported type when it passes `<Outlet context={... satisfies SomeExportedType}>`,
- `undefined` when the route is never handed a context (root route, or the parent renders a bare
  `<Outlet />`),
- `unknown` when the context cannot be determined statically.

A route then writes:

```tsx
import type { NearestOutletContext } from "./+toolkit-types/my-route";

const ctx = useOutletContext<NearestOutletContext>();
```

Run it before type checking:

```jsonc
// package.json
{
  "scripts": {
    "typecheck": "react-router-toolkit typegen && tsc",
  },
}
```

Map the generated directory in `tsconfig.json` via `rootDirs` (the same mechanism React Router's
own `.react-router/types` uses) so `./+toolkit-types/<route>` resolves from route files:

```jsonc
{
  "include": [".react-router-toolkit/types/**/*" /* ... */],
  "compilerOptions": {
    "rootDirs": [".", "./.react-router-toolkit/types"],
  },
}
```

Add `.react-router-toolkit/` to `.gitignore`.

The companion oxlint plugin's `type-safe-outlet-context` rule auto-fills the
`useOutletContext<NearestOutletContext>()` type argument and its import in descendant routes.
