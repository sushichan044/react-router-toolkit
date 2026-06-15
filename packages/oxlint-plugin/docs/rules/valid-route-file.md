# `valid-route-file`

Ensure every route module path declared in `routes.ts` points to an existing file, and that every
route-shaped file in the app directory is registered in the route config.

Three related problems are caught in a single rule, all reported on the `export default` statement
of the routes config file:

1. **`missingDefaultExport`** — The routes config file exists but does not default-export its route
   config, so React Router cannot read it.
2. **`missingRouteFile`** — A route declared in the config (`index(...)`, `route(...)`,
   `layout(...)`, etc.) points to a file that does not exist on disk.
3. **`orphanRouteFile`** — A file exists inside the app directory that looks like a route module
   but is not registered in the route config.

The rule only runs on the **routes config file** (typically `app/routes.ts`). It uses filesystem
information gathered at plugin setup time and never reads the disk during linting.

## Valid

```ts
// app/routes.ts
import { index, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  index("home.tsx"), // home.tsx exists
  route("about", "about.tsx"), // about.tsx exists
] satisfies RouteConfig;
```

## Invalid: missing default export

```ts
// ❌ No default export — React Router cannot load the route config
import { index, route } from "@react-router/dev/routes";
```

Error: `missingDefaultExport` at line 1, column 0.

## Invalid: missing route file

```ts
// ❌ settings.tsx is declared but does not exist on disk
import { route, type RouteConfig } from "@react-router/dev/routes";

export default [
  route("settings", "settings.tsx"), // ← reported here
] satisfies RouteConfig;
```

Error: `missingRouteFile`

```text
Route module "settings.tsx" does not exist (resolved: app/settings.tsx).
```

The error is reported on the `export default` keyword (not the entire declaration), to keep the
squiggle narrow even when the route array spans many lines.

## Invalid: orphan route file

An orphan is a file inside the app directory that was detected as a potential route module (e.g.,
by naming convention or directory structure) but is not referenced in the current route config.

```ts
// app/routes.ts — only registers home/route.tsx
import { index, type RouteConfig } from "@react-router/dev/routes";

export default [index("home/route.tsx")] satisfies RouteConfig;

// app/orphan/route.tsx exists but is not registered → reported
```

Error: `orphanRouteFile`

```text
Route file "orphan/route.tsx" exists but is not registered in this route config.
Register it or move it out of the app directory.
```

## Scope

All three checks apply only to the routes config file. Route module files themselves are not linted
by this rule — use other rules in this plugin (e.g., `valid-route-type-imports`,
`no-unknown-route-exports`) to lint route module content.

The root route (`root.tsx`) is exempt from `missingRouteFile` because React Router's framework mode
always synthesizes a root route entry even if the file is absent.

## No auto-fix

None of the three messages have an auto-fix. Creating, renaming, or deleting route files involves
filesystem changes that are outside the scope of an inline code fix.
