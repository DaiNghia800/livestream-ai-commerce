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
      ],
    },
  },
});
