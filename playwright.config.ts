import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // A production build, not `next dev` — dev's webpack Fast Refresh can
  // fire mid-navigation on a route's first-ever on-demand compile and
  // reset an in-flight client-side `<Link>` navigation back to the
  // previous URL, which showed up as real, reproducible E2E flakiness
  // (see Phase 3's overview.md). Testing against a production-like
  // server is also generally the more meaningful E2E target.
  webServer: {
    command: "npm run build && npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
