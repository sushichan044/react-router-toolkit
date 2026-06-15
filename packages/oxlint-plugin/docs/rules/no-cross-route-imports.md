# `no-cross-route-imports`

Disallow importing route modules from other route modules to prevent tight coupling between routes.

React Router route modules are independently loadable units. When one route module imports from
another, the two routes become coupled at the module graph level: a change in the imported route can
silently affect the importing route, bundle splitting is degraded, and circular-dependency risks
increase. Code that is genuinely shared between routes belongs in a shared module outside the routes
directory.

The rule resolves both relative imports and tsconfig path aliases using the project's `tsconfig.json`
at setup time. It never reads the filesystem during linting.

## Valid

```tsx
// Importing from a shared module outside the routes directory
import { sharedValue } from "./shared";

// Importing a co-located component that is not a route module
import { SharedComponent } from "./_components/shared-component";

// Type-only import is allowed by default (see allowTypeImports)
import type { SomeType } from "./about.tsx";

// All specifiers are type-only — treated as a type import
import { type SomeType, type AnotherType } from "./about.tsx";
```

## Invalid

```tsx
// ❌ Relative import of another route module
import { something } from "./about.tsx";
import { something } from "./about"; // extension is optional

// ❌ Alias import of another route module (tsconfig paths resolved)
import { something } from "~/about.tsx";
import { something } from "~/about";

// ❌ Re-export from another route module
export { something } from "./about.tsx";
export * from "./about.tsx";

// ❌ Mixed import — has at least one value specifier
import { type SomeType, someValue } from "./about.tsx";

// ❌ Type import when allowTypeImports is false
// options: [{ allowTypeImports: false }]
import type { SomeType } from "./about.tsx";
```

Error message: `crossRouteImport`

The error message includes the target route module path relative to the project root:

```text
Importing route module "app/about.tsx" from another route couples the two routes. Move the shared
code outside the routes directory (or into a shared module) instead.
```

## tsconfig path alias resolution

The rule reads the `tsconfig.json` at plugin setup time and resolves any `paths` aliases defined
there. All standard resolvable extensions (`.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.mts`) are tried
when no explicit extension is provided.

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "paths": {
      "~/*": ["./app/*"],
    },
  },
}
```

```tsx
// home.tsx (route module)
// about.tsx is also a route module → reported
import { something } from "~/about"; // ❌
```

## Options

```jsonc
// oxlint.json
{
  "rules": {
    "react-router-toolkit/no-cross-route-imports": ["error", { "allowTypeImports": false }],
  },
}
```

| Option             | Type      | Default | Description                                                                                      |
| ------------------ | --------- | ------- | ------------------------------------------------------------------------------------------------ |
| `allowTypeImports` | `boolean` | `true`  | When `true`, `import type { ... }` and imports where all specifiers are `type`-only are allowed. |

Setting `allowTypeImports: false` forbids all imports from other route modules, including
type-only ones. This is useful when you want to enforce strict module isolation and avoid any
dependency on another route's type surface.

## Scope

The rule only runs when the **current file** is a registered route module. Imports of route modules
from non-route files (utilities, shared components, test helpers) are never reported.

```tsx
// shared.ts — not a route module → rule is a no-op for this file
import { something } from "./about.tsx"; // ✅ not reported
```

## Known limitations

- **Barrel files**: If a shared barrel `index.ts` re-exports from a route module, importing from the
  barrel is not caught. Only direct imports of route module files are detected.
- **Co-located files**: Files that live in the same directory as a route module but are not
  themselves registered as routes (e.g., `_components/`, `*.test.ts`) are correctly treated as
  non-route files and are not reported.
- **Dynamic imports**: `import("./about.tsx")` (dynamic `import()` expressions) are not checked.
  Only static `import` declarations and `export … from` re-exports are analyzed.
- **No settings → no-op**: When the plugin settings are absent, the rule produces no reports.
