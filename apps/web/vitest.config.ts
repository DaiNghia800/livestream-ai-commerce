import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Tests in this package are Playwright specs (`npm test`); vitest must not collect them.
    include: [],
    passWithNoTests: true,
  },
});
