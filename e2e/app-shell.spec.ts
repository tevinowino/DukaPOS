import { expect, test } from "@playwright/test";

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
