# `type-safe-outlet-context`

Keep the type of a layout's outlet context and its consumers in sync **without writing the type on
both sides**.

React Router types `<Outlet context={...}>` and `useOutletContext<T>()` as `unknown` — there is no
type-level link between the value a layout passes and the type a descendant route reads. This rule
adds that link statically:

- The parent layout annotates the context **once** with `satisfies <ExportedType>`.
- Every descendant route's `useOutletContext()` is auto-filled (and kept in sync) with that type.

The connection is resolved from the route tree built at lint setup time, so the rule never performs
cross-file type inference.

## Parent route (renders `<Outlet context={...}>`)

The context value must be annotated with `satisfies <Type>`, where `<Type>` is a **type alias
defined and exported in the same route module**. This guarantees a descendant route can import the
type by name from the parent module.

```tsx
// ✅ valid
import { Outlet } from "react-router";

export type ShopContext = { shopId: string };

export default function Layout() {
  return <Outlet context={{ shopId } satisfies ShopContext} />;
}
```

Anything other than `satisfies <a type alias declared and exported in this module>` is reported as
an error with **no auto-fix** — the developer fixes it by hand. Auto-fixing these would be too
invasive: adding `export` silently changes the module's public surface, and rewriting `as` to
`satisfies` changes type-checking semantics.

| Situation                                                       | Message                          |
| --------------------------------------------------------------- | -------------------------------- |
| `context={...}` with no `satisfies`/`as`                        | `missingOutletContextAnnotation` |
| `context={... as Type}`                                         | `useSatisfiesNotAs`              |
| `satisfies` with an inline/anonymous type                       | `inlineOutletContextType`        |
| `satisfies Name` where `Name` is not a type alias declared here | `outletContextTypeNotLocal`      |
| `satisfies Name` where `Name` is not exported                   | `outletContextTypeNotExported`   |
| `<Outlet {...props} />` (spread attributes)                     | `outletSpreadAttribute`          |
| `<Outlet>` rendered from an exported (non-default) component    | `outletInExportedComponent`      |

Spreading attributes onto `<Outlet>` is forbidden: it hides whether — and with what type — context
is passed, which breaks the static guarantee descendant routes rely on. Pass `context` explicitly.

### Where the `<Outlet>` must be rendered

React Router renders a route module's **default export** as the route component, so only an
`<Outlet>` reached from the default export actually passes context to child routes. The rule
recognizes an `<Outlet>` when it is rendered either:

- directly inside the default-export component, or
- inside a **non-exported local component** that the default export renders.

An `<Outlet>` placed in an **exported** (non-default) component is reported as
`outletInExportedComponent`: because React Router never renders that component as this route, the
Outlet does not pass context to descendants. Move it into the default export (or a non-exported
local component it renders). An `<Outlet>` in a local component that the default export never renders
is dead code and is ignored. These same rules decide which outlet a child route infers from.

## Child route (calls `useOutletContext()`)

The rule fills in or corrects the generic type argument to match the immediate parent layout's
exported context type, adding the `import type` from the parent module when needed.

```tsx
// before
const ctx = useOutletContext();
// after --fix
import type { ShopContext } from "../layout";
const ctx = useOutletContext<ShopContext>();
```

Only the **immediate** parent's `<Outlet>` is consulted, matching React Router: every `<Outlet>`
resets the outlet context, so a child never inherits an ancestor's context through an intermediate
layout that renders a bare `<Outlet>`.

- When the immediate parent renders a bare `<Outlet />` (no `context`, no spread), the context is
  always `undefined` at runtime, so calling `useOutletContext()` there is reported as
  `parentOutletPassesNoContext` (no fix — no type is inserted). This holds even if a grandparent
  layout passes context.
- When the parent passes context with more than one differing type, or mixes a typed `<Outlet>` with
  a bare one, the rule reports `ambiguousParentOutletContext` and makes no change.
- When the parent passes context but not yet as a usable exported type alias, the child is left
  untouched (the parent-side messages above guide the fix).

## Scope

The rule only runs on route modules (files present in the resolved route manifest). Plain components
that happen to call `useOutletContext` or render `<Outlet>` are ignored. Only the immediate parent
layout is considered, matching React Router's runtime behavior where the nearest `<Outlet>` wins.
