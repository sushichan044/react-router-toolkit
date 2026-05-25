import { resolve } from "node:path";

import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: {
      "~routes": resolve(import.meta.dirname, "app/route-defs"),
    },
  },
});
