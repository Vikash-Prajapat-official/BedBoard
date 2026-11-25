import { defineConfig } from "vitest/config";
import path from "node:path";

// Needs a real PostgreSQL. Set TEST_DATABASE_URL to a throwaway database (see README, "Tests").
export default defineConfig({
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    fileParallelism: false,
    testTimeout: 30_000,
    env: { DATABASE_URL: process.env.TEST_DATABASE_URL ?? "" },
  },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
