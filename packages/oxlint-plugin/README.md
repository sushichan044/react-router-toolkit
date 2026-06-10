# @react-router-toolkit/oxlint-plugin

An [oxlint](https://oxc.rs/docs/guide/usage/linter/js-plugins.html) (and ESLint-compatible) plugin
that verifies the route module paths declared in your React Router `routes.ts` point to files that
actually exist.

The plugin reads a **pre-resolved** React Router config from the linter `settings`. You resolve the
config once at config-load time (with top-level `await`), so the lint rules run synchronously against
the already-resolved route manifest instead of evaluating your project on every lint pass.

## Install

```sh
pnpm add -D @react-router-toolkit/oxlint-plugin
```

Peer dependencies: `react-router >=7.0.0`, `vite ^7.0.0 || ^8.0.0`.

## Usage

Resolve your project's config in `oxlint.config.ts` and pass it through `settings`:

```ts
import { reactRouterToolkitSettings } from "@react-router-toolkit/oxlint-plugin/setup";
import { defineConfig } from "oxlint";

export default defineConfig({
  jsPlugins: ["@react-router-toolkit/oxlint-plugin"],
  settings: {
    ...(await reactRouterToolkitSettings({ root: import.meta.dirname })),
  },
  rules: {
    "react-router-toolkit/valid-route-file": "error",
    "react-router-toolkit/type-safe-outlet-context": "error",
  },
});
```

`reactRouterToolkitSettings({ root })` resolves the config the same way React Router does at build
time (honoring your `vite.config.ts`, aliases, plugins, presets, and `appDirectory`) and returns it
under the `"react-router-toolkit"` settings key as a JSON-serializable object. Alongside the resolved
manifest it also analyzes each route module's source once (via `oxc-parser`) and records the outlet
context type it passes, so the rules never re-read other files while linting.

## Rules

### `valid-route-file`

Reports every route module path declared via `index`, `route`, `layout`, ... in the resolved route
manifest whose file does not exist on disk. The diagnostic is reported on the exact source literal in
`routes.ts` when available.

### `type-safe-outlet-context`

Keeps `useOutletContext<T>()` in sync with the parent layout's `<Outlet context={...}>` without
writing the type on both sides. See [docs/rules/type-safe-outlet-context.md](./docs/rules/type-safe-outlet-context.md).

- **Parent route** (renders `<Outlet context={...}>`): the context value must be annotated with
  `satisfies <Type>`, where `<Type>` is a type alias **defined and exported in that same module**.
  Anything else (no annotation, `as`, an inline type, a non-local or non-exported type) is reported
  as an error with no auto-fix — silently adding `export` or rewriting `as` is too invasive. The
  `<Outlet>` must be rendered from the module's default export (or a non-exported local component it
  renders); an `<Outlet>` in an exported component never passes context and is reported.
- **Child route** (calls `useOutletContext()`): the rule fills in / corrects the generic type
  argument to that exported type and adds the `import type { Type }` from the parent module. When the
  parent passes no context, the child is left untouched.
