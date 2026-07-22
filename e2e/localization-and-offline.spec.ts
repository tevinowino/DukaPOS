import { expect, test, type Page } from "@playwright/test";

// Overrides playwright.config.ts's global "block" (see app-shell.spec.ts
// for why that default exists). This spec's whole "offline navigation
// doesn't dead-end" premise depends on Serwist's real service worker —
// its NetworkFirst runtime caching (`defaultCache` in src/app/sw.ts) is
// what lets a page visited once while online still navigate while
// offline. With the SW blocked, every navigation is a real network
// request with nothing to fall back to, and offline navigation hangs.
test.use({ serviceWorkers: "allow" });

async function waitForServiceWorkerActivation(page: Page) {
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
}

async function enterPin(page: Page, pin: string) {
  for (const digit of pin) {
    await page.getByRole("button", { name: digit, exact: true }).click();
  }
}

async function completeOnboarding(page: Page) {
  await page.goto("/");
  await page.getByLabel("Shop name").fill("Mama Njeri's Shop");
  await page.getByLabel("Phone number").fill("0712345678");
  await page.getByRole("button", { name: "Continue" }).click();
  await enterPin(page, "1234");
  await enterPin(page, "1234");
  await expect(page.getByText("DukaPOS")).toBeVisible();
}

/**
 * Clicks a nav link and re-enters the PIN if `AppLockGate` re-locked.
 *
 * Real, observed behavior (documented in this phase's overview.md): the
 * *first* server round trip after switching locale — a navigation to a
 * route whose data isn't already cached under the new locale — remounts
 * everything under the root layout, including `AppLockGate`'s in-memory
 * "unlocked" state, because `[locale]` is a real dynamic route segment
 * (ADR-6) and its resolved value just changed. This is not a dead end
 * (the PIN screen is a fully working screen, and the digit buttons are
 * unlabeled numerals — locale-independent), just an extra prompt, so
 * tests tolerate it the same way `offline-sync.spec.ts` already does for
 * its own reload case rather than treating it as a failure.
 */
async function clickLinkTolerateRelock(page: Page, linkName: string) {
  await page.getByRole("link", { name: linkName }).click();
  await page.waitForLoadState("load").catch(() => {});
  // `isVisible()` is an instantaneous check, not a poll — it can race the
  // relock UI's render. `waitFor` actually polls, bounded to a short
  // window so it doesn't slow down the (more common) non-relock path.
  const relocked = await page
    .getByRole("button", { name: "1", exact: true })
    .waitFor({ state: "visible", timeout: 3_000 })
    .then(() => true)
    .catch(() => false);
  if (relocked) {
    await enterPin(page, "1234");
  }
}

test("toggling to Swahili updates every major screen, and the toggle keeps working offline", async ({
  page,
  context,
}) => {
  await completeOnboarding(page);
  await waitForServiceWorkerActivation(page);

  await page.getByRole("button", { name: "SW" }).click();
  await expect(page.getByText("Fuatilia bidhaa na mauzo kutoka kwenye simu yako")).toBeVisible();

  await clickLinkTolerateRelock(page, "Angalia bidhaa");
  await expect(page.getByRole("heading", { name: "Bidhaa" })).toBeVisible();
  await expect(page.getByRole("link", { name: "← Nyumbani" })).toBeVisible();

  await page.getByRole("link", { name: "← Nyumbani" }).click();
  await clickLinkTolerateRelock(page, "Uuzaji mpya");
  await expect(page.getByRole("heading", { name: "Uuzaji mpya" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ongeza bidhaa" })).toBeVisible();

  await page.getByRole("link", { name: "← Nyumbani" }).click();
  await clickLinkTolerateRelock(page, "Sasisha bidhaa (maandishi)");
  await expect(page.getByRole("heading", { name: "Sasisha bidhaa" })).toBeVisible();

  // ADR-6's locale toggle must work with zero network dependency — prove
  // it by switching back to English while fully offline, using only the
  // client-side state `AppIntlProvider` already holds (see its doc
  // comment); this is the required-tests edge case for "locale toggle
  // used while offline." No navigation happens here, so there's no
  // remount/relock risk to tolerate.
  await context.setOffline(true);
  await page.getByRole("button", { name: "EN" }).click();
  await expect(page.getByRole("heading", { name: "Update stock" })).toBeVisible();
  await page.getByRole("button", { name: "SW" }).click();
  await expect(page.getByRole("heading", { name: "Sasisha bidhaa" })).toBeVisible();
});

test("navigating between screens while offline never shows a raw error state", async ({
  page,
  context,
}) => {
  await completeOnboarding(page);
  await waitForServiceWorkerActivation(page);

  // Visit each destination once while online so the app-shell/route data
  // this app relies on for offline navigation (Serwist's precache, per
  // ADR from Phase 1) is warm before going offline — mirroring how a real
  // shopkeeper would already have opened these screens earlier in the day.
  await page.getByRole("link", { name: "View stock" }).click();
  await expect(page.getByRole("heading", { name: "Stock" })).toBeVisible();
  await page.getByRole("link", { name: "← Home" }).click();
  await page.getByRole("link", { name: "New sale" }).click();
  await expect(page.getByRole("heading", { name: "New sale" })).toBeVisible();
  await page.getByRole("link", { name: "← Home" }).click();
  await page.getByRole("link", { name: "Update stock (text)" }).click();
  await expect(page.getByRole("heading", { name: "Update stock" })).toBeVisible();
  await page.getByRole("link", { name: "← Home" }).click();

  await context.setOffline(true);

  await page.getByRole("link", { name: "View stock" }).click();
  // A slightly generous margin over the default 5s: this is the first
  // offline navigation, falling back to the SW's cache (see sw.ts's
  // `ignoreSearch` fix) rather than resolving from memory like an online
  // client-side transition would.
  await expect(page.getByRole("heading", { name: "Stock" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/application error/i)).not.toBeVisible();

  await page.getByRole("link", { name: "← Home" }).click();
  await page.getByRole("link", { name: "New sale" }).click();
  await expect(page.getByRole("heading", { name: "New sale" })).toBeVisible();
  await expect(page.getByText(/application error/i)).not.toBeVisible();

  await page.getByRole("link", { name: "← Home" }).click();
  await page.getByRole("link", { name: "Update stock (text)" }).click();
  await expect(page.getByRole("heading", { name: "Update stock" })).toBeVisible();
  await expect(page.getByText(/application error/i)).not.toBeVisible();

  // The AI-dependent action on this screen is itself offline-aware (see
  // stock-update/page.tsx) — trying it offline must show the honest
  // offline message, not hang or throw.
  await page.getByLabel("Describe what changed").fill("sold 2 bread");
  await page.getByRole("button", { name: "Parse update" }).click();
  await expect(
    page.getByText("Reading updates needs a connection — we'll try again once you're back online"),
  ).toBeVisible();
});
