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
        "import.meta.vitest": "undefined", // Eliminate `import.meta.vitest` branches
        "import.meta.e2e": "undefined", // Eliminate `import.meta.e2e` branches
      },
    },
  ],
});
