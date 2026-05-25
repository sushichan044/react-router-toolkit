import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: [
    {
      attw: { level: "error", profile: "esm-only" },
      clean: true,
      dts: {
        tsgo: true,
      },
      entry: ["src/index.ts"],
      fixedExtension: true,
      format: "esm",
      fromVite: true,
      minify: "dce-only",
      nodeProtocol: true,
      publint: true,
      sourcemap: false,
      treeshake: true,
      unused: true,
      define: {
        "import.meta.vitest": "undefined", // Avoid bundling Vitest's `import.meta.vitest` in the output, which would cause runtime errors in user projects that don't use Vitest.
        "import.meta.e2e": "undefined", // Similarly avoid bundling `import.meta.e2e`.
      },
    },
  ],
});
