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

test("manual add, edit, and delete a product from the stock list", async ({ page }) => {
  // No camera permission is granted anywhere in this test — the manual-entry
  // path must be reachable without ever touching the scanner.
  await completeOnboarding(page);

  // Client-side navigation, not page.goto() — a hard navigation would
  // remount AppLockGate and re-lock the app (in-memory unlock state,
  // by design; see plan/phase-02.../overview.md).
  await page.getByRole("link", { name: "View stock" }).click();
  await expect(page.getByText("No products yet")).toBeVisible();

  // Two "Add product" links are visible on the empty stock list (the
  // header button and the empty-state call-to-action); either works.
  await page.getByRole("link", { name: "Add product" }).first().click();
  await page.getByRole("button", { name: "Add manually" }).click();

  await page.getByLabel("Product name").fill("Sugar 1kg");
  await page.getByLabel("Price (KES)").fill("150");
  await page.getByLabel("Stock quantity").fill("20");
  await page.getByRole("button", { name: "Save product" }).click();

  await expect(page).toHaveURL(/\/products$/);
  await expect(page.getByText("Sugar 1kg")).toBeVisible();
  await expect(page.getByText("20 in stock")).toBeVisible();

  await page.getByText("Sugar 1kg").click();
  await expect(page.getByLabel("Stock quantity")).toHaveValue("20");
  await page.getByLabel("Stock quantity").fill("12");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page).toHaveURL(/\/products$/);
  await expect(page.getByText("12 in stock")).toBeVisible();

  await page.getByText("Sugar 1kg").click();
  await page.getByRole("button", { name: "Delete product" }).click();
  await page.getByRole("button", { name: "Yes, delete" }).click();

  await expect(page).toHaveURL(/\/products$/);
  await expect(page.getByText("Sugar 1kg")).toHaveCount(0);
  await expect(page.getByText("No products yet")).toBeVisible();
});
