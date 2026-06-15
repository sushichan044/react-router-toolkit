# `valid-route-type-imports`

Ensure route modules import generated route types from their own generated type modules, and use
typegen-provided types instead of generic React Router types.

React Router and `react-router-toolkit` both generate per-route type modules keyed by the route
module's file basename:

```tsx
import type { Route } from "./+types/child";
import type { NearestOutletContext } from "./+toolkit-types/child";
```

This rule has two responsibilities:

1. **Wrong or missing generated type imports** — Reports imports of `Route` or
   `NearestOutletContext` that point at a different route's generated module, and fixes them to this
   route's own module. Also inserts the import when the name is used but no import exists.
2. **Handwritten route types** — Reports when a route module imports generic React Router types
   (e.g., `LoaderFunctionArgs`) that should be replaced by the typegen-generated `Route.*`
   equivalents, which carry route-specific param and data typing.

The rule only runs on route modules present in the resolved route manifest. It uses route module
facts gathered during plugin setup and never reads the filesystem while linting.

## Valid

```tsx
// child.tsx
import type { Route } from "./+types/child";
import type { NearestOutletContext } from "./+toolkit-types/child";

export function loader({ params }: Route.LoaderArgs) {
  return params;
}

export default function Child() {
  const context: NearestOutletContext = { shopId: "shop_1" };
  return context.shopId;
}
```

Type imports that are not `Route` or `NearestOutletContext` are ignored even if they come from a
different route's generated module:

```tsx
// ✅ not reported — OtherRouteType is not a tracked generated type name
import type { OtherRouteType } from "./+types/other";
```

Non-type imports from `react-router` that are not in the handwritten replacement map are also
ignored:

```tsx
// ✅ not reported — redirect is a runtime value, not a generic type
import { redirect } from "react-router";

// ✅ not reported — ShouldRevalidateFunction is not in the replacement map
import type { ShouldRevalidateFunction } from "react-router";
```

## Invalid: wrong generated type import

```tsx
// ❌ child.tsx importing from a sibling route's module
import type { Route } from "./+types/other";
import type { NearestOutletContext } from "./+toolkit-types/other";
```

With `--fix`:

```tsx
import type { Route } from "./+types/child";
import type { NearestOutletContext } from "./+toolkit-types/child";
```

This also applies when the import points at a non-generated module path:

```tsx
// ❌ shared hand-rolled type module
import type { Route } from "../shared/react-router-types";
import type { NearestOutletContext } from "../shared/toolkit-types";
```

With `--fix`:

```tsx
import type { Route } from "./+types/child";
import type { NearestOutletContext } from "./+toolkit-types/child";
```

Error messageIds: `wrongReactRouterTypeImport`, `wrongToolkitTypeImport`

## Invalid: missing generated type import

When `Route.*` or `NearestOutletContext` is used in a route module but no matching import exists,
the rule inserts the import automatically.

```tsx
// ❌ uses Route.LoaderArgs and NearestOutletContext without importing them
export function loader({ params }: Route.LoaderArgs) {
  return params;
}

export default function Child() {
  const context: NearestOutletContext = { shopId: "shop_1" };
  return context.shopId;
}
```

With `--fix`:

```tsx
import type { Route } from "./+types/child";
import type { NearestOutletContext } from "./+toolkit-types/child";
export function loader({ params }: Route.LoaderArgs) {
  return params;
}

export default function Child() {
  const context: NearestOutletContext = { shopId: "shop_1" };
  return context.shopId;
}
```

Error messageIds: `missingReactRouterTypeImport`, `missingToolkitTypeImport`

## Invalid: handwritten route types

Generic React Router types imported directly from `react-router` or `react-router-dom` lose
route-specific typing (path params, loader data, etc.). The rule reports them and suggests the
`Route.*` equivalent from the typegen module.

| Generic type (import from react-router) | Use instead              |
| --------------------------------------- | ------------------------ |
| `LoaderFunctionArgs`                    | `Route.LoaderArgs`       |
| `ActionFunctionArgs`                    | `Route.ActionArgs`       |
| `ClientLoaderFunctionArgs`              | `Route.ClientLoaderArgs` |
| `ClientActionFunctionArgs`              | `Route.ClientActionArgs` |
| `MetaFunction`                          | `Route.MetaFunction`     |
| `MetaArgs`                              | `Route.MetaArgs`         |
| `LinksFunction`                         | `Route.LinksFunction`    |
| `HeadersFunction`                       | `Route.HeadersFunction`  |
| `HeadersArgs`                           | `Route.HeadersArgs`      |

```tsx
// ❌ child.tsx — generic types lose route-specific params typing
import type { LoaderFunctionArgs, ActionFunctionArgs, MetaFunction } from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => null;
export const action = async ({ request }: ActionFunctionArgs) => null;
export const meta: MetaFunction = () => [];
```

Error messageId: `handwrittenRouteType` (one per specifier)

There is no auto-fix for `handwrittenRouteType` because the replacement also requires adding or
correcting the `import type { Route } from "./+types/<basename>"` import, which may conflict with
other pending fixes in the same run.

## Scope

The rule only runs on route modules registered in the route manifest. Non-route files may freely
import any types from `react-router` without triggering `handwrittenRouteType`, and may import from
any `./+types/` path without triggering wrong-import messages.

```tsx
// not-a-route.tsx — not in routes.ts → rule is a no-op
import type { LoaderFunctionArgs } from "react-router";
export function createLoader(fn: (args: LoaderFunctionArgs) => unknown) {
  return fn;
}
```

The rule does not verify that typegen has already written the generated files. A missing generated
file is caught by type checking, which is the signal to run React Router typegen and
`react-router-toolkit typegen`.
