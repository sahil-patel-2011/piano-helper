import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    testTimeout: 30_000,
    // Tests change process.env (APPDATA, PATH), so keep them in one process, in order.
    fileParallelism: false,
  },
});
