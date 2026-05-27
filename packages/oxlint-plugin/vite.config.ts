import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: [
    {
      attw: { level: "error", profile: "esm-only" },
      clean: true,
      dts: {
        tsgo: true,
      },
      entry: ["src/index.ts", "src/worker/**/*"],
      fixedExtension: true,
      format: "esm",
      fromVite: true,
      minify: "dce-only",
      nodeProtocol: true,
      publint: true,
      sourcemap: false,
      treeshake: true,
      // The eval worker is spawned as a child process by path, so it must keep its own file in the
      // output tree rather than being bundled or tree-shaken away. `unbundle` preserves the source
      // folder structure (e.g. dist/worker/eval-worker.mjs).
      unbundle: true,
      // `react-router` and `vite` are peer dependencies consumed transitively by the evaluator
      // inside the worker, not imported directly, so the unused-dependency check cannot see them.
      unused: {
        ignore: ["react-router", "vite"],
      },
    },
  ],
});
