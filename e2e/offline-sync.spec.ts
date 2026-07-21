import { expect, test, type Page } from "@playwright/test";

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

const SEEDED_ENTRY_ID = "e2e-seeded-sync-entry";

/**
 * Writes a row directly to the `syncQueue` IndexedDB object store — the
 * same store `src/lib/sync/queue.ts`'s `enqueue()` writes to. Not
 * `page.evaluate`-ing a UI form submission here is deliberate: every
 * route in this app is dynamically rendered (no static prefetch), so a
 * real add-product submission's post-save `router.push` needs a network
 * round-trip that queues as an unpredictable fallback full-page
 * navigation once offline — which remounts AppLockGate and races any
 * later assertion (a real gap, tracked for Phase 9's "sweep for offline
 * dead-ends"). Seeding the same store directly keeps this test focused on
 * what it actually checks — sync-status reactivity to online/offline —
 * without depending on that unrelated navigation gap.
 */
async function seedUnsyncedProductEntry(page: Page) {
  await page.evaluate((entryId) => {
    return new Promise<void>((resolve, reject) => {
      const openRequest = indexedDB.open("DukaDB");
      openRequest.onsuccess = () => {
        const db = openRequest.result;
        const tx = db.transaction("syncQueue", "readwrite");
        tx.objectStore("syncQueue").add({
          id: entryId,
          type: "product",
          payload: {
            id: crypto.randomUUID(),
            name: "Sugar 1kg",
            category: "Groceries",
            priceKES: 100,
            stockQty: 10,
            source: "manual",
          },
          createdAt: Date.now(),
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
      openRequest.onerror = () => reject(openRequest.error);
    });
  }, SEEDED_ENTRY_ID);
}

/** Reads the seeded entry's `syncedAt` back out of IndexedDB — `undefined` until a real drain has marked it. */
async function readSeededEntrySyncedAt(page: Page): Promise<number | undefined> {
  return page.evaluate((entryId) => {
    return new Promise<number | undefined>((resolve, reject) => {
      const openRequest = indexedDB.open("DukaDB");
      openRequest.onsuccess = () => {
        const db = openRequest.result;
        const tx = db.transaction("syncQueue", "readonly");
        const getRequest = tx.objectStore("syncQueue").get(entryId);
        getRequest.onsuccess = () => resolve(getRequest.result?.syncedAt);
        getRequest.onerror = () => reject(getRequest.error);
      };
      openRequest.onerror = () => reject(openRequest.error);
    });
  }, SEEDED_ENTRY_ID);
}

test("sync status reflects offline queuing and updates once back online", async ({
  page,
  context,
}) => {
  await completeOnboarding(page);

  // Mocked at the network boundary — this test verifies sync-status
  // reactivity, independent of whether a real Convex deployment is
  // connected (see Phase 5's overview.md: this environment has none).
  await page.route("**/api/sync", async (route) => {
    const request = route.request();
    const body = JSON.parse(request.postData() ?? "{}") as {
      entries?: { id: string }[];
    };
    const results = (body.entries ?? []).map((entry) => ({ id: entry.id, status: "synced" }));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ results }),
    });
  });

  await context.setOffline(true);
  await seedUnsyncedProductEntry(page);

  await expect(
    page.getByText("Offline — changes will sync when you're back online"),
  ).toBeVisible();
  expect(await readSeededEntrySyncedAt(page)).toBeUndefined();

  await context.setOffline(false);

  // Next.js's App Router automatically revalidates the current route on
  // the browser's `online` event, which reloads/remounts the page here —
  // and since AppLockGate re-checks on every mount, that re-shows the PIN
  // lock too. Wait for that to settle and unlock again if it happened,
  // then poll the underlying IndexedDB state (survives the reload, unlike
  // React/UI state, and any transient "execution context destroyed"
  // errors from a further reload while polling) for proof the queued
  // entry actually got drained — the behavior this test exists to prove,
  // independent of exactly how many reloads it takes to observe it.
  await page.waitForLoadState("load").catch(() => {});
  if (
    await page
      .getByRole("heading", { name: "Enter your PIN" })
      .isVisible()
      .catch(() => false)
  ) {
    await enterPin(page, "1234");
  }

  async function pollSyncedAt(): Promise<number | undefined> {
    try {
      return await readSeededEntrySyncedAt(page);
    } catch {
      return undefined;
    }
  }

  await expect
    .poll(pollSyncedAt, { timeout: 40_000, intervals: [500] })
    .toEqual(expect.any(Number));
});
