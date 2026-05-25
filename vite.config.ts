import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {
    ignorePatterns: ["pnpm-*.yaml", "CHANGELOG.md"],
    jsdoc: true,
    sortImports: true,
  },
  lint: {
    categories: {
      correctness: "off",
      nursery: "error",
      perf: "error",
    },
    options: {
      typeAware: true,
      typeCheck: true,
    },
    env: {
      node: true,
    },
    jsPlugins: ["vite-plus/oxlint-plugin"],
    rules: {
      "vite-plus/prefer-vite-plus-imports": "error",
    },
  },
  test: {
    benchmark: {
      include: ["**/*.{bench,benchmark}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    },
    passWithNoTests: true,
    typecheck: {
      enabled: true,
    },
    globals: true,
  },
});
