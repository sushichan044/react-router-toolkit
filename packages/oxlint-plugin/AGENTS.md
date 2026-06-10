# packages/oxlint-plugin

## Goodies

- See https://oxc.rs/docs/guide/usage/linter/writing-js-plugins.md to how to write an Oxlint plugin.
  - ALWAYS use alternative API (createOnce).

### Philosophy

- Fast lint rules are all we need.
  - Return `false` from `before` hook whenever the rule can skip the file.
  - For performance, ensure the before hook checks if the rule applies before parsing the AST, and returns false whenever possible.
- If cross-file analysis that can be calculated in advance is required, it is recommended to first create an API for analysis in `packages/react-router-toolkit` and complete the analysis at the time of linter plugin setup in `src/setup.ts`.
- DO NOT access the filesystem in rule implementations; it heavily degrades performance.
