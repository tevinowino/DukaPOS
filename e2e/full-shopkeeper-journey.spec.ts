import { expect, test, type Page } from "@playwright/test";

// Deliberately keeps playwright.config.ts's global service-worker "block"
// default (unlike e2e/localization-and-offline.spec.ts): this spec mocks
// many API routes with page.route(), and an active service worker can
// claim a matching fetch (e.g. any GET /api/* — see src/app/sw.ts's
// `defaultCache`) before Playwright's mock ever sees it, silently letting
// the real request through (the exact bug Phase 7 documented and fixed by
// blocking the SW by default). The "offline" step below is written to not
// need the SW either — see its own comment.

async function enterPin(page: Page, pin: string) {
  for (const digit of pin) {
    await page.getByRole("button", { name: digit, exact: true }).click();
  }
}

/** A minimal valid 1x1 red PNG — real Chromium's canvas needs genuinely decodable image bytes. */
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

/**
 * One continuous shopkeeper day, touching every PRD §4 MVP capability at
 * least once: onboarding, all three product-add methods, both payment
 * methods, NL stock updates, the daily summary, and an offline/online
 * cycle. Network-boundary mocks (Gemma, Paystack, sync) follow each
 * capability's own phase — see the individual specs this test draws from
 * (product-management, photo-product-id, sales-flow, mpesa-checkout,
 * stock-update-and-summary, offline-sync) for why each is mocked rather
 * than run against the real service.
 */
test("a full shopkeeper day: onboard, stock the shop three ways, sell two ways, update stock by voice-like text, review the day, then survive a connectivity drop", async ({
  page,
  context,
}) => {
  await test.step("onboarding", async () => {
    // Mocked from the very start, not just in the later "back online"
    // step: this app's background sync (useOnlineSync's on-mount and
    // reconnect-triggered drainQueue) fires throughout normal use
    // whenever the app is online, not only right after a deliberate
    // offline/online cycle — leaving it unmocked earlier would let real,
    // failing (no Convex connected in this environment) /api/sync calls
    // race with the later mocked ones via drainQueue's own
    // `currentlySyncing` in-flight guard.
    await page.route("**/api/sync", async (route) => {
      const body = JSON.parse(route.request().postData() ?? "{}") as {
        entries?: { id: string }[];
      };
      const results = (body.entries ?? []).map((entry) => ({ id: entry.id, status: "synced" }));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ results }),
      });
    });

    await page.goto("/");
    await page.getByLabel("Shop name").fill("Mama Njeri's Shop");
    await page.getByLabel("Phone number").fill("0712345678");
    await page.getByRole("button", { name: "Continue" }).click();
    await enterPin(page, "1234");
    await enterPin(page, "1234");
    await expect(page.getByText("DukaPOS")).toBeVisible();
  });

  await test.step("add product 1: manual entry", async () => {
    await page.getByRole("link", { name: "View stock" }).click();
    await expect(page.getByText("No products yet")).toBeVisible();
    await page.getByRole("link", { name: "Add product" }).first().click();
    await page.getByRole("button", { name: "Add manually" }).click();
    await page.getByLabel("Product name").fill("Sugar 1kg");
    await page.getByLabel("Price (KES)").fill("150");
    await page.getByLabel("Stock quantity").fill("20");
    await page.getByRole("button", { name: "Save product" }).click();
    await expect(page).toHaveURL(/\/products$/);
    await expect(page.getByText("Sugar 1kg")).toBeVisible();
    await expect(page.getByText("20 in stock")).toBeVisible();
  });

  await test.step("add product 2: barcode entry point, manual-entry fallback (no camera in CI)", async () => {
    await page.getByRole("link", { name: "Add product" }).first().click();
    await page.getByRole("button", { name: "Scan barcode" }).click();
    await page.getByRole("button", { name: "Enter manually instead" }).click();
    await page.getByLabel("Product name").fill("Rice 2kg");
    await page.getByLabel("Barcode (optional)").fill("6161100009999");
    await page.getByLabel("Price (KES)").fill("220");
    await page.getByLabel("Stock quantity").fill("15");
    await page.getByRole("button", { name: "Save product" }).click();
    await expect(page).toHaveURL(/\/products$/);
    await expect(page.getByText("Rice 2kg")).toBeVisible();
    await expect(page.getByText("15 in stock")).toBeVisible();
  });

  await test.step("add product 3: photo identification (mocked Gemma)", async () => {
    await page.route("**/api/identify-product", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          name: "Cooking Oil 1L",
          category: "Groceries",
          estimatedPriceKES: 320,
        }),
      });
    });

    await page.getByRole("link", { name: "Add product" }).first().click();
    await page.getByRole("link", { name: "Add via photo" }).click();
    await page.getByLabel("Take a photo of the product").setInputFiles({
      name: "photo.png",
      mimeType: "image/png",
      buffer: Buffer.from(TINY_PNG_BASE64, "base64"),
    });
    await expect(page.getByRole("heading", { name: "Confirm the details" })).toBeVisible();
    await expect(page.getByLabel("Product name")).toHaveValue("Cooking Oil 1L");
    await page.getByLabel("Stock quantity").fill("10");
    await page.getByRole("button", { name: "Save product" }).click();
    await expect(page).toHaveURL(/\/products$/);
    await expect(page.getByText("Cooking Oil 1L")).toBeVisible();
  });

  await test.step("record a cash sale", async () => {
    await page.getByRole("link", { name: "← Home" }).click();
    await page.getByRole("link", { name: "New sale" }).click();
    // New sale defaults to the Barcode tab (no camera in CI) — switch to
    // the Search tab, same fallback proven above for the barcode add-product flow.
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page.getByText("Sugar 1kg").click();
    await page.getByRole("button", { name: "Confirm sale" }).click();
    await expect(page.getByRole("heading", { name: "Sales" })).toBeVisible();
    await expect(page.getByText(/Sugar 1kg/)).toBeVisible();

    await page.getByRole("link", { name: "← Home" }).click();
    await page.getByRole("link", { name: "View stock" }).click();
    await expect(page.getByText("19 in stock")).toBeVisible();
    await page.getByRole("link", { name: "← Home" }).click();
  });

  await test.step("record an M-Pesa sale (mocked Paystack + webhook completion)", async () => {
    await page.route("**/api/checkout", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ reference: "journey-test-ref", displayText: "Check your phone" }),
      });
    });
    let pollCount = 0;
    await page.route("**/api/checkout/status*", async (route) => {
      pollCount += 1;
      const status = pollCount >= 2 ? "completed" : "pending";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status }),
      });
    });

    await page.getByRole("link", { name: "New sale" }).click();
    // New sale defaults to the Barcode tab (no camera in CI) — switch to
    // the Search tab, same fallback proven above for the barcode add-product flow.
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page.getByText("Rice 2kg").click();
    await page.getByRole("button", { name: "M-Pesa" }).click();
    await page.getByRole("button", { name: "Pay with M-Pesa" }).click();
    await expect(page.getByRole("heading", { name: "Pay with M-Pesa" })).toBeVisible();
    await page.getByRole("button", { name: "Send payment request" }).click();
    await expect(page.getByText("Check your phone")).toBeVisible();
    await expect(page.getByText("Payment received — sale complete.")).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole("link", { name: "← Home" }).click();
    await page.getByRole("link", { name: "View stock" }).click();
    await expect(page.getByText("14 in stock")).toBeVisible();
    await page.getByRole("link", { name: "← Home" }).click();
  });

  await test.step("natural-language stock update (mocked Gemma)", async () => {
    await page.route("**/api/parse-stock", async (route) => {
      const body = JSON.parse(route.request().postData() ?? "{}") as {
        existingProducts?: { id: string; name: string }[];
      };
      const oil = body.existingProducts?.find((product) => product.name === "Cooking Oil 1L");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          updates: [
            {
              productId: oil?.id,
              productNameGuess: "Cooking Oil 1L",
              quantityDelta: 3,
              direction: "decrease",
            },
          ],
        }),
      });
    });

    await page.getByRole("link", { name: "Update stock (text)" }).click();
    await page.getByLabel("Describe what changed").fill("sold 3 cooking oil");
    await page.getByRole("button", { name: "Parse update" }).click();
    await expect(page.getByText("Cooking Oil 1L")).toBeVisible();
    await page.getByRole("button", { name: /Apply 1 changes/ }).click();
    await expect(page.getByText("Updated 1 products.")).toBeVisible();

    await page.getByRole("link", { name: "← Home" }).click();
    await page.getByRole("link", { name: "View stock" }).click();
    await expect(page.getByText("7 in stock")).toBeVisible();
    await page.getByRole("link", { name: "← Home" }).click();
  });

  await test.step("view the daily summary (mocked Gemma)", async () => {
    await page.route("**/api/summary", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          summary: "Busy day: sold sugar for cash and rice via M-Pesa, cooking oil restocked down by 3.",
        }),
      });
    });

    await page.getByRole("link", { name: "Today's summary" }).click();
    await page.getByRole("button", { name: "Generate summary" }).click();
    await expect(page.getByText(/Busy day: sold sugar for cash/)).toBeVisible();
    await page.getByRole("link", { name: "← Home" }).click();
  });

  await test.step("go offline: the shell and every product added so far stay usable", async () => {
    // Navigate to the stock list *while still online* (the service worker
    // is blocked in this spec — see the top-of-file comment — so a *new*
    // offline navigation isn't reliable here the way
    // e2e/localization-and-offline.spec.ts separately proves it can be
    // with the SW active). The connectivity drop happens only once this
    // page has already fully loaded, so nothing new needs to be fetched —
    // this is exactly the "screen already open when the signal drops"
    // scenario, which is what "existing data stays usable offline" means
    // for local-first (Dexie-backed) data in the first place.
    await page.getByRole("link", { name: "View stock" }).click();
    await expect(page.getByRole("heading", { name: "Stock" })).toBeVisible();
    await expect(page.getByText("Sugar 1kg")).toBeVisible();
    await expect(page.getByText("19 in stock")).toBeVisible();
    await expect(page.getByText("Rice 2kg")).toBeVisible();
    await expect(page.getByText("14 in stock")).toBeVisible();
    await expect(page.getByText("Cooking Oil 1L")).toBeVisible();
    await expect(page.getByText("7 in stock")).toBeVisible();

    await context.setOffline(true);

    // Still fully rendered and interactive — no re-fetch was needed for
    // any of this, since it's all local IndexedDB data already in memory.
    await expect(page.getByText("Sugar 1kg")).toBeVisible();
    await expect(page.getByText("Rice 2kg")).toBeVisible();
    await expect(page.getByText("Cooking Oil 1L")).toBeVisible();
    await expect(page.getByText(/application error/i)).not.toBeVisible();
  });

  await test.step("back online: sync recovers", async () => {
    // /api/sync has been mocked since the "onboarding" step (see its
    // comment) — no new registration needed here.
    await context.setOffline(false);

    // Reconnecting can trigger a full reload (Next's router refreshes on
    // the browser's `online` event), which remounts AppLockGate and
    // re-locks — the same known, documented behavior
    // e2e/offline-sync.spec.ts already tolerates. Handle it the same way.
    // `waitFor` (not `isVisible()`, which is an instantaneous, non-polling
    // check) so this doesn't race the reload's own render.
    await page.waitForLoadState("load").catch(() => {});
    const relocked = await page
      .getByRole("heading", { name: "Enter your PIN" })
      .waitFor({ state: "visible", timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    if (relocked) {
      await enterPin(page, "1234");
    }

    // Still on (or back on) the stock list either way — sync status
    // recovers to a settled state (see SyncStatusBar.tsx): "Up to date"
    // if everything was already synced earlier in this journey (the
    // mock's been active since onboarding, so most writes drain well
    // before this point), or "Last synced at ..." if this reconnect is
    // what actually flushed the last pending entry — either is a genuine
    // recovery. What matters is it's neither stuck mid-sync nor stuck
    // reporting offline.
    await expect(page.getByText(/Up to date|Last synced at/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Offline — changes will sync when you're back online")).not.toBeVisible();
    await expect(page.getByText("Syncing…")).not.toBeVisible();
  });
});
