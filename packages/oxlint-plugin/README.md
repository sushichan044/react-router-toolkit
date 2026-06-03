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
  },
});
```

`reactRouterToolkitSettings({ root })` resolves the config the same way React Router does at build
time (honoring your `vite.config.ts`, aliases, plugins, presets, and `appDirectory`) and returns it
under the `"react-router-toolkit"` settings key as a JSON-serializable object.

## Rules

### `valid-route-file`

Reports every route module path declared via `index`, `route`, `layout`, ... in the resolved route
manifest whose file does not exist on disk. The diagnostic is reported on the exact source literal in
`routes.ts` when available.
