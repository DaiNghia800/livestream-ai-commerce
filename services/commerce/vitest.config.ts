import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**"],
      exclude: [
        "src/server.ts",
        "src/database.ts",
        "src/modules/livestream/index.ts",
        "src/modules/livestream/types/**",
        "dist/**",
        "tests/**",
        "src/**/index.ts",
        "src/**/types/**",
      ],
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 90 },
    },
  },
});

