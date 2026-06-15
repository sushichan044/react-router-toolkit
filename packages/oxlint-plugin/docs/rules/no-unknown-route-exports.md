# `no-unknown-route-exports`

Disallow named exports from route modules that React Router does not recognize, preventing silent
dead code.

React Router only reads a fixed set of named exports from each route module (`loader`, `action`,
`meta`, `default`, etc.). Any other named export is silently ignored at runtime — a typo like
`loadre` or an accidentally exposed helper function will never cause an error, but the export will
have no effect. This rule makes that invisible dead code visible at lint time.

The rule only runs on route modules present in the resolved route manifest. Files that are not
registered routes are skipped entirely.

## Valid

```tsx
// All recognized React Router route module exports
export async function loader() {
  return null;
}
export async function clientLoader() {
  return null;
}
export async function action() {
  return null;
}
export async function clientAction() {
  return null;
}
export function ErrorBoundary() {
  return null;
}
export function HydrateFallback() {
  return null;
}
export function headers() {
  return {};
}
export function handle() {
  return {};
}
export function links() {
  return [];
}
export function meta() {
  return [];
}
export function shouldRevalidate() {
  return true;
}
export function middleware() {}
export function clientMiddleware() {}
export default function Home() {
  return null;
}

// Layout is allowed on the root route module only (see below)
// root.tsx
export function Layout({ children }) {
  return children;
}

// Type-only exports are always allowed — they are erased at runtime
export type ShopContext = { shopId: string };
export interface Foo {
  bar: string;
}
export { type Foo };

// Re-exporting under a recognized name is allowed
const internalLoader = async () => null;
export { internalLoader as loader };
```

## Invalid

```tsx
// ❌ Typo in a recognized export name
export const loadre = async () => null;

// ❌ Unknown function export
export function handler() {}

// ❌ Unknown re-export
const internalHelper = () => {};
export { internalHelper };

// ❌ Layout on a non-root route (only root.tsx may export Layout)
// home.tsx
export function Layout({ children }) {
  return children;
}
export default function Home() {
  return null;
}
```

Error message: `unknownRouteExport`

## Type exports are exempt

All TypeScript type-level exports are ignored because they are erased at build time and React Router
never sees them at runtime:

- `export type Foo = ...` (type alias declaration with `export type`)
- `export interface Foo { ... }` (interface declaration)
- `export type { Foo }` (type re-export using `export type { ... }`)
- `export { type Foo }` (inline `type` modifier on a specifier)

## `Layout` on the root route

React Router recognizes the `Layout` named export exclusively on the **root route module**
(`root.tsx`). Exporting `Layout` from any other route module is reported, because React Router
silently ignores it there.

```tsx
// ✅ root.tsx — allowed
export function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

// ❌ home.tsx — reported
export function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
```

## Options

```jsonc
// oxlint.json
{
  "rules": {
    "react-router-toolkit/no-unknown-route-exports": [
      "error",
      { "allowedExports": ["sharedConfig", "routeMeta"] },
    ],
  },
}
```

| Option           | Type       | Default | Description                                                                            |
| ---------------- | ---------- | ------- | -------------------------------------------------------------------------------------- |
| `allowedExports` | `string[]` | `[]`    | Export names that are explicitly allowed even if React Router does not recognize them. |

Use `allowedExports` when a framework, meta-framework, or in-house tooling reads additional named
exports from route modules:

```tsx
// options: [{ allowedExports: ["sharedConfig"] }]
export const sharedConfig = { key: "value" }; // ✅ skipped
export const unknownHelper = () => {}; // ❌ still reported
```

## Scope

The rule only runs on route modules present in the resolved route manifest. Exporting an unknown
name from a non-route file (a utility, a component, a shared module) is never reported.

```tsx
// not-a-route.tsx — not in routes.ts → never reported
export const loadre = async () => null; // ✅ no report
```
