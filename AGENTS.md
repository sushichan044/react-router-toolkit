# AGENTS.md

YOU MUST ENSURE `vp run build && vp check --fix && vp test` PASSES BEFORE ENDING ANY TASKS.

## What we making

This is a toolkit for performing cross-file analysis in accordance with the conventions of the React Router v7+ framework.
Its purpose is to facilitate the control of the entire codebase at the static analysis layer.

## Script

- `vp check`: Run formatter, linter, type checker.
- `vp check --fix`: Run formatter, linter, type checker with auto-fix where possible.
  - Use this instead of `tsc --noEmit` or `tsgo --noEmit`.
- `vp test`: Run tests.
- `vp run build`: Build the artifact.

## Goodies

### Philosophy

- Export only refined APIs with clear use cases and types.

### Testing

- Write test cases that covers edge cases.
- Test cases must be describable in terms of concise, user-facing behavior.
- Prefer [Extending test context with `test.extend()`](https://vitest.dev/guide/test-context.md) rather than beforeEach/afterEach.
