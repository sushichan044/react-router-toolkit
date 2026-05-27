import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {
    ignorePatterns: ["pnpm-lock.yaml", "CHANGELOG.md"],
    jsdoc: true,
    sortImports: true,
  },
  lint: {
    ignorePatterns: ["**/test/fixtures/**"],
    categories: {
      correctness: "error",
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
    rules: {
      "import/consistent-type-specifier-style": "error",
      "typescript/consistent-type-assertions": "error",
      "typescript/consistent-type-imports": "error",
      "typescript/no-misused-promises": "error",
      "typescript/array-type": ["error", { default: "array-simple" }],
    },
    plugins: ["import"],
  },
  test: {
    benchmark: {
      include: ["**/*.{bench,benchmark}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    },
    projects: [
      {
        define: {
          "import.meta.e2e": "true",
        },
        test: {
          name: "e2e",
          include: [
            "packages/e2e/**/*.test.{js,mjs,cjs,ts,mts,cts,jsx,tsx}",
            "packages/e2e-relative/**/*.test.{js,mjs,cjs,ts,mts,cts,jsx,tsx}",
          ],
        },
      },
      {
        test: {
          name: "react-router-toolkit",
          include: ["packages/react-router-toolkit/**/*.test.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
        },
      },
      {
        test: {
          name: "oxlint-plugin",
          include: ["packages/oxlint-plugin/**/*.test.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
        },
      },
    ],
    typecheck: {
      enabled: true,
    },
  },
});
