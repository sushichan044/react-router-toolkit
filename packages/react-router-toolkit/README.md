# react-router-toolkit

Load a React Router (Framework Mode) `app/routes.ts` file the same way React
Router does at build time, and inspect the result as a typed route tree. Built
on Vite's ModuleRunner so the user project's `vite.config.ts`, aliases, and
plugins all stay consistent with what the production build sees.

Use it when you need to ask questions about a React Router project's routing
that are awkward to answer from inside React Router itself — typically when
writing static-analysis tooling like linter plugins:

- enumerate every reachable URL pattern,
- ask which layouts surround a given URL,
- look up which route module renders a given route id,
- reverse-look a file path back to its route entry.

## Install

```sh
pnpm add -D react-router-toolkit
```

`vite` and `react-router` must already be installed in the host project
(declared as peer dependencies):

```jsonc
{
  "peerDependencies": {
    "react-router": ">=7.0.0",
    "vite": "^7.0.0 || ^8.0.0",
  },
}
```
