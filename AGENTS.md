# AGENTS.md

YOU MUST ENSURE `vp run build && vp check --fix && vp test` PASSES BEFORE ENDING ANY TASKS.

## Script

- `vp check`: Run formatter, linter, type checker.
- `vp check --fix`: Run formatter, linter, type checker with auto-fix where possible.
  - Use this instead of `tsc --noEmit` or `tsgo --noEmit`.
- `vp test`: Run tests.
- `vp run build`: Build the artifact.
