import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.js", "src/**/*.test.js", "api/**/*.test.js"],
    environment: "node",
    globals: false,
    setupFiles: ["tests/setup-auth.js"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
