import { expect, test } from "@playwright/test";

test("app shell loads and registers a service worker", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("DukaPOS")).toBeVisible();

  // @serwist/next's plugin is webpack-only (see package.json's `--webpack`
  // flag and this phase's overview.md "Deviations" — Next 16 defaults to
  // Turbopack, which silently skips the service-worker build step).
  await page.waitForFunction(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return registration !== undefined && registration.active !== null;
  });

  const registration = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    return { active: reg?.active?.state };
  });
  expect(registration.active).toBe("activated");
});
