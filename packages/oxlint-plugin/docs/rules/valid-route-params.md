# `valid-route-params`

Ensure `useParams()` only accesses route parameters that exist on the current route (including
inherited ancestor params).

React Router types `useParams()` as `Readonly<Params<string>>`, which means any string key is
accepted without a type error. Accessing a param that does not exist in the route path silently
returns `undefined` at runtime, with no warning. This rule checks the keys accessed through
`useParams()` against the route's actual parameter set (derived from the route path in `routes.ts`)
and reports any key that cannot be present.

The rule only runs on route modules present in the resolved route manifest. Parameter sets are
computed at plugin setup time from the entire route tree, so ancestor parameters are always
included.

## Valid

```tsx
// routes.ts: route("shops", "shops.tsx", [route(":shop_id", "shop-detail.tsx")])

// shop-detail.tsx — :shop_id is defined on this route
import { useParams } from "react-router";
const { shop_id } = useParams();

// Rename destructuring — the key is checked, not the local binding name
const { shop_id: id } = useParams();

// Member access patterns
const params = useParams();
const id = params.shop_id;
const id2 = params["shop_id"];

// Renamed import
import { useParams as up } from "react-router";
const { shop_id } = up();

// Also works with react-router-dom
import { useParams } from "react-router-dom";
const { shop_id } = useParams();
```

## Invalid

```tsx
// shop-detail.tsx — shopId (camelCase) does not exist; shop_id does
import { useParams } from "react-router";
const { shopId } = useParams();
//     ^^^^^^ unknownRouteParam: "shopId" does not exist (available: shop_id)

// shops.tsx — route has no params at all
const { shop_id } = useParams();
//      ^^^^^^^ unknownRouteParam: "shop_id" does not exist (available: none)

// Member access with an unknown key
const params = useParams();
const id = params.nope;
//               ^^^^ unknownRouteParam

// Computed string literal access
const id = params["nope"];
//                ^^^^^^ unknownRouteParam

// Rename destructuring with an unknown key
const { shopId: id } = useParams();
//      ^^^^^^ unknownRouteParam
```

Error message: `unknownRouteParam`

The error message includes both the unknown key and the full list of available params:

```
Route param "shopId" does not exist on this route (available: shop_id).
Check the route path definition in routes.ts.
```

When the route has no params, `available` is reported as `none`.

## Ancestor parameters

React Router accumulates route parameters along the path from the root to the current route. A
child route module can access all params defined by its ancestors in addition to its own. The rule
uses the same accumulation: it collects all `:param` and `*` (splat) segments from the route and
every ancestor route.

```
routes.ts:
  route("shops", "shops.tsx", [
    route(":shop_id", "shop-detail.tsx")
  ])
```

`shop-detail.tsx` has `shop_id` in its allowed set. If there were a further child route, it would
inherit `shop_id` as well.

## Scope

The rule only runs on route modules registered in the route manifest. Calling `useParams()` in a
plain component or utility function that is not a route module is never reported.

```tsx
// not-a-route.tsx — not in routes.ts → rule is a no-op
import { useParams } from "react-router";
const { shopId } = useParams(); // ✅ not reported
```

## Known limitations

- **Binding tracking scope**: The rule tracks `useParams()` return values only when assigned
  directly to an identifier (e.g., `const params = useParams()`). If the return value is passed
  through function calls, spread, or reassigned, member accesses on the resulting value are not
  checked.
- **Computed keys from expressions**: `params[someVariable]` (non-literal computed access) is not
  checked because the key is not statically knowable.
- **Type arguments are not inspected**: The generic type argument of `useParams<T>()` is ignored.
  Only the destructuring pattern and member expressions on the returned binding are analyzed.
- **No settings → no-op**: When the plugin settings are absent, the rule produces no reports.
