# `valid-route-type-imports`

Ensure route modules import generated route types from their own generated type modules.

React Router and `react-router-toolkit` both generate per-route type modules. Those modules are
named from the current route module's file basename, so a route file should import:

```tsx
import type { Route } from "./+types/child";
import type { NearestOutletContext } from "./+toolkit-types/child";
```

This rule reports imports that point at another route module's generated types and fixes them to the
current route module's generated type module. It also inserts a missing generated type import when a
route module references `Route.*` or `NearestOutletContext` without the matching import.

The rule only runs on route modules present in the resolved route manifest. It uses route module
facts gathered during plugin setup and never reads the filesystem while linting.

## Valid

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

## Invalid

```tsx
import type { Route } from "./+types/other";
import type { NearestOutletContext } from "./+toolkit-types/other";
```

With `--fix`:

```tsx
import type { Route } from "./+types/child";
import type { NearestOutletContext } from "./+toolkit-types/child";
```

## Scope

This rule checks import correctness. It does not require every route export to be annotated with
generated types, and it does not verify that typegen has already written the generated files. Missing
generated files are caught by type checking, which is the signal to run React Router typegen and
`react-router-toolkit typegen`.
