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

test("record a cash sale, see stock reduced, and see it in the transaction log", async ({
  page,
}) => {
  await completeOnboarding(page);

  // Seed a product through the real Phase 3 UI (client-side navigation
  // throughout — a hard page.goto() would remount AppLockGate and re-lock).
  await page.getByRole("link", { name: "View stock" }).click();
  await page.getByRole("link", { name: "Add product" }).first().click();
  await page.getByRole("button", { name: "Add manually" }).click();
  await page.getByLabel("Product name").fill("Sugar 1kg");
  await page.getByLabel("Price (KES)").fill("100");
  await page.getByLabel("Stock quantity").fill("10");
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByText("10 in stock")).toBeVisible();

  await page.getByRole("link", { name: "← Home" }).click();
  await page.getByRole("link", { name: "New sale" }).click();

  // New sale defaults to the Barcode tab (no camera in CI) — switch to the Search tab.
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByText("Sugar 1kg").click();
  await page.getByLabel("Quantity for Sugar 1kg").fill("3");
  await expect(page.getByText("Total: KES 300")).toBeVisible();

  await page.getByRole("button", { name: "Confirm sale" }).click();

  // recordCashSale redirects to /transactions on success.
  await expect(page).toHaveURL(/\/transactions$/);
  await expect(page.getByText("Sugar 1kg × 3")).toBeVisible();
  // "KES 300" now also appears in the day's payment-breakdown card (cash
  // total and grand total), alongside this specific sale's own total —
  // `.first()` avoids a strict-mode multi-match, and any one of the three
  // is equally good evidence the 300 total was computed correctly.
  await expect(page.getByText("KES 300").first()).toBeVisible();

  await page.getByRole("link", { name: "← Home" }).click();
  await page.getByRole("link", { name: "View stock" }).click();
  await expect(page.getByText("7 in stock")).toBeVisible();
});
