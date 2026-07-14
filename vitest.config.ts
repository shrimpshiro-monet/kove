import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/server/lib/__tests__/**/*.test.ts", "tests/**/*.test.{ts,tsx}"],
    environment: "node",
  },
});
