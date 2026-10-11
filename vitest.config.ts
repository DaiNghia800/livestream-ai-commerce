import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // apps/web tests are Playwright specs and must not run under vitest.
    exclude: [...configDefaults.exclude, "apps/web/**"],
  },
});
