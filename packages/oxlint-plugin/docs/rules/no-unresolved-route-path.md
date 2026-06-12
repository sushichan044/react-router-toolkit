# `no-unresolved-route-path`

Ensure every path passed to navigation APIs and link components resolves to a route in the React
Router route config (or to a static file in the `public/` directory).

React Router's route config is the single source of truth for which URLs the application serves.
When a `navigate()` call or a `<Link to>` uses a path that matches no registered route, the user
lands on a 404 at runtime — with no compile-time or type-check signal. This rule surfaces those
broken paths at lint time, before the app ships.

The route tree is resolved from the manifest built at plugin setup time. The rule never reads the
filesystem during linting.

## Valid

```tsx
import { Link, NavLink, Form, redirect } from "react-router";

// Static paths that match a registered route
navigate("/");
navigate("/about");
navigate("/about?ref=home");
navigate("/about#section");

// Dynamic segment filled with a template literal
navigate(`/shops/${shopId}`);

// Components
<Link to="/about">About</Link>
<NavLink to="/about">About</NavLink>
<Form action="/about">...</Form>
<a href="/about">About</a>

// redirect() in a loader
export const loader = () => redirect("/about");

// Static file served from public/
<a href="/manual.pdf">Download</a>

// External and relative URLs are ignored
navigate("../about");
<a href="https://example.com/page">link</a>
<a href="//cdn.example.com/resource">link</a>
<a href="mailto:user@example.com">email</a>
```

## Invalid

```tsx
// ❌ Path does not match any route
navigate("/nonexistent");

// ❌ Template literal path does not match any route
navigate(`/nope/${id}`);

// ❌ Component paths
<Link to="/nonexistent">Broken</Link>
<NavLink to="/nonexistent">Broken</NavLink>
<Form action="/nonexistent">...</Form>
<a href="/nonexistent">Broken</a>

// ❌ redirect() target
import { redirect } from "react-router";
export const loader = () => redirect("/nope");
```

Error message: `unresolvedRoutePath`

## Dynamic segments in template literals

Template literals whose first quasi starts with `/` are checked against the route tree. Each
interpolated expression (`` `…${expr}…` ``) is treated as a generic dynamic segment placeholder and
matched against `:param` or `*` (splat) segments. Trailing dynamic segments that expand to an empty
string are also allowed.

```tsx
// Route: /shops/:shop_id
navigate(`/shops/${shopId}`); // ✅ matches — ${shopId} fills :shop_id

navigate(`/nope/${id}`); // ❌ /nope has no registered route
```

When an expression fills a **static** segment (e.g., `` `/shops/${staticString}/edit` `` but only
`/shops/:id/edit` exists), the rule reports a violation because the placeholder matches any dynamic
segment, not an arbitrary static one. See [Known Limitations](#known-limitations).

## Public asset detection

After failing the route-tree match, the rule strips the query string and hash from the pathname,
applies `decodeURI`, and checks the path against the set of files present in the project's
`public/` directory at setup time. URL-encoded filenames (including non-ASCII characters) are
decoded before comparison.

```tsx
// public/manual.pdf exists → allowed
<a href="/manual.pdf">Download</a>

// public/STORES ロイヤリティ同意事項.pdf exists → allowed (URL-encoded href)
<a href="/STORES%20%E3%83%AD%E3%82%A4%E3%83%A4%E3%83%AA%E3%83%86%E3%82%A3%E5%90%8C%E6%84%8F%E4%BA%8B%E9%A0%85.pdf">Terms</a>
```

## Options

```jsonc
// oxlint.json
{
  "rules": {
    "react-router-toolkit/no-unresolved-route-path": [
      "error",
      { "allowedPaths": ["/admin", "/api"] },
    ],
  },
}
```

| Option         | Type       | Default | Description                                                                                                                  |
| -------------- | ---------- | ------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `allowedPaths` | `string[]` | `[]`    | Path prefixes that are always considered valid. Any path that starts with one of these prefixes is skipped without checking. |

`allowedPaths` is useful for paths that belong to a separate sub-app (e.g., `/admin`) or a
server-rendered section that is not part of the React Router route config.

```tsx
// options: [{ allowedPaths: ["/admin"] }]
navigate("/admin/dashboard"); // ✅ skipped — starts with /admin
navigate("/nonexistent"); // ❌ still reported
```

## Covered APIs

| API                                           | Checked attribute / argument |
| --------------------------------------------- | ---------------------------- |
| `navigate(path)`                              | First argument               |
| `redirect(path)` (imported from react-router) | First argument               |
| `<Link to={...}>`                             | `to` prop                    |
| `<NavLink to={...}>`                          | `to` prop                    |
| `<Form action={...}>`                         | `action` prop                |
| `<a href={...}>`                              | `href` attribute             |

`Link`, `NavLink`, and `Form` are tracked by their import binding from `react-router` or
`react-router-dom`, so renames on import are handled correctly:

```tsx
import { redirect as rr } from "react-router";
export const loader = () => rr("/nope"); // ❌ reported
```

## Known limitations

- **Dynamic expressions matching static segments**: A template literal expression placeholder
  (`${expr}`) matches any `:param` or `*` segment but not a literal static segment. If the route is
  `/shops/featured` (static), `` `/shops/${tab}` `` will be reported even if `tab` is always
  `"featured"` at runtime.
- **Relative paths are not checked**: Paths that do not start with `/` (e.g., `"../about"`,
  `"./child"`) are silently skipped.
- **`useNavigate` rename is not tracked**: The rule recognises calls to `navigate()` by the
  identifier name `navigate` only. If `useNavigate` returns a value stored under a different name
  (e.g., `const go = useNavigate(); go("/nope")`), that call is not checked.
- **No settings → no-op**: When the plugin settings are absent, the rule produces no reports.
