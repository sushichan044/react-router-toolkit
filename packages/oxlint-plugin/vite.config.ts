import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: [
    {
      attw: { level: "error", profile: "esm-only" },
      clean: true,
      dts: {
        tsgo: true,
      },
      entry: ["src/index.ts", "src/setup.ts"],
      fixedExtension: true,
      format: "esm",
      fromVite: true,
      minify: "dce-only",
      nodeProtocol: true,
      publint: true,
      sourcemap: false,
      treeshake: true,
      // `react-router` and `vite` are peer dependencies consumed transitively by
      // `resolveReactRouterConfig` inside the setup helper, not imported directly. `oxc-parser` is a
      // direct dependency, but it is reached only through the bundled `react-router-toolkit`, so the
      // unused-dependency check cannot see it either.
      unused: {
        ignore: ["react-router", "vite"],
      },
      deps: {
        alwaysBundle: ["react-router-toolkit", "valibot", "@oxlint/plugins"],
      },
    },
  ],
});
