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
    plugins: ["import", "node", "unicorn"],
    rules: {
      "import/consistent-type-specifier-style": "error",
      "typescript/array-type": ["error", { default: "array-simple" }],
      "typescript/ban-ts-comment": "error",
      "typescript/consistent-type-assertions": "error",
      "typescript/consistent-type-imports": "error",
      "typescript/no-misused-promises": "error",
      "typescript/no-explicit-any": "error",
      "typescript/no-unnecessary-type-assertion": "error",
      "typescript/no-unnecessary-type-conversion": "error",
      "typescript/no-unsafe-call": "error",
      "typescript/non-nullable-type-assertion-style": "error",
      "node/no-path-concat": "error",
      "unicorn/custom-error-definition": "error",
    },
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
