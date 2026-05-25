import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {
    ignorePatterns: ["pnpm-*.yaml", "CHANGELOG.md"],
    jsdoc: true,
    sortImports: true,
  },
  lint: {
    ignorePatterns: ["**/test/fixtures/**"],
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
      // This library is published with `vite` declared as a peer dependency, so
      // the build output must import directly from `vite` rather than from the
      // internal `vite-plus` wrapper.
      "vite-plus/prefer-vite-plus-imports": "off",
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
          name: "react-router-routing-toolkit",
          include: [
            "packages/react-router-routing-toolkit/**/*.test.{js,mjs,cjs,ts,mts,cts,jsx,tsx}",
          ],
        },
      },
    ],
    typecheck: {
      enabled: true,
    },
  },
});
