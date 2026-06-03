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
      // `resolveReactRouterConfig` inside the setup helper, not imported directly, so the
      // unused-dependency check cannot see them.
      unused: {
        ignore: ["react-router", "vite"],
      },
    },
  ],
});
