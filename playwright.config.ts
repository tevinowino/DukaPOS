import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // All specs share one `next start` server (see webServer below). Capped
  // as a general precaution against contention on a single shared dev-
  // machine server, not because a specific contention failure was proven
  // here — see app-shell.spec.ts's comment for what an earlier long hang
  // actually turned out to be (a stale reused server process, not this).
  workers: 2,
  // A generous but not excessive margin over Playwright's 30s default.
  // Real note for later: this default fires *outside* any in-test
  // `expect.poll({ timeout })` budget — if a poll is configured for, say,
  // 30s but the surrounding test's own timeout is also ~30s, the test can
  // be killed at the outer limit before the poll's own timeout is ever
  // reached. "Test timeout of Nms exceeded" in a failure is that outer
  // timeout, not a poll's inner one; raising only the poll's timeout does
  // nothing in that situation — raise this value too.
  timeout: 45_000,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    // Serwist's active service worker can intercept a fetch before
    // Playwright's page.route() ever sees it, silently bypassing a mocked
    // API response and letting the real network request through (caught
    // real: an unmocked /api/identify-product call reached the actual
    // Gemini API and got a genuine 404 for the configured model id —
    // see this phase's overview.md). Blocked by default for reliable
    // route mocking; app-shell.spec.ts overrides this back to "allow"
    // since it specifically tests that the service worker registers.
    serviceWorkers: "block",
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
