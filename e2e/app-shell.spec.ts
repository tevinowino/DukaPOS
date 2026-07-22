import { expect, test } from "@playwright/test";

// Overrides playwright.config.ts's global "block" — this is the one spec
// that specifically needs the real service worker to register and activate.
test.use({ serviceWorkers: "allow" });

test("app shell loads and registers a service worker", async ({ page }) => {
  await page.goto("/");

  // Not asserting visible body text here: Phase 2's AppLockGate means a
  // fresh context shows onboarding, not the shell content, at "/". The
  // page title comes from server-rendered metadata and is unaffected by
  // which client-side gate state is showing.
  await expect(page).toHaveTitle("DukaPOS");

  // @serwist/next's plugin is webpack-only (see package.json's `--webpack`
  // flag and this phase's overview.md "Deviations" — Next 16 defaults to
  // Turbopack, which silently skips the service-worker build step).
  //
  // Note for future debugging: this assertion once hung indefinitely
  // (30s, then 60s — no progress either time) across every worker count.
  // Root cause was environmental, not this test or the app: a `next
  // start` server process from an earlier, unrelated `npx playwright
  // test` invocation was still alive and listening on :3000, so
  // `webServer`'s `reuseExistingServer` kept reusing that stale process
  // (skipping the build+start command entirely) across many later runs —
  // its service worker registration state had degraded from repeated
  // reconnects over a long session. Killing the stale process (check
  // `netstat -ano | findstr :3000` and stop whatever's listening) fixed
  // it immediately; real pass time is ~2-3s. If this hangs again, check
  // for a stale server before assuming a test or timeout problem.
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const registration = await navigator.serviceWorker.getRegistration();
          return registration?.active?.state;
        }),
      { timeout: 15_000 },
    )
    .toBe("activated");
});
