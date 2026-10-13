import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // services/commerce carries its own env + globalSetup; running its tests
    // from the root without that config leaves the payment gateways unconfigured.
    // apps/web tests are Playwright specs and must not run under vitest.
    projects: ["services/commerce"],
  },
});
