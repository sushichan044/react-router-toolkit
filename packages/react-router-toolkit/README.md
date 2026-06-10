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
- reverse-look a file path back to its route entry.

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
