import { expect, test } from "@playwright/test";

async function enterPin(page: import("@playwright/test").Page, pin: string) {
  for (const digit of pin) {
    await page.getByRole("button", { name: digit, exact: true }).click();
  }
}

test("onboarding sets up a shop, then the PIN lock gates the app on reload", async ({
  page,
}) => {
  await page.goto("/");

  // Fresh browser context (no IndexedDB yet): onboarding appears.
  await expect(page.getByRole("heading", { name: "Set up your shop" })).toBeVisible();

  await page.getByLabel("Shop name").fill("Mama Njeri's Shop");
  await page.getByLabel("Phone number").fill("0712345678");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { name: "Choose a 4-digit PIN" })).toBeVisible();
  await enterPin(page, "1234");

  await expect(page.getByRole("heading", { name: "Confirm your PIN" })).toBeVisible();
  await enterPin(page, "1234");

  // Onboarding complete: app content, not onboarding, is now visible.
  await expect(page.getByText("DukaPOS")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Set up your shop" })).toHaveCount(0);

  await page.reload();

  // A shop profile now exists: the lock screen appears (not onboarding).
  await expect(page.getByRole("heading", { name: "Enter your PIN" })).toBeVisible();

  await enterPin(page, "0000");
  // Next.js's own route announcer also has role="alert", so scope by text.
  await expect(page.getByText(/incorrect pin/i)).toBeVisible();

  await enterPin(page, "1234");
  await expect(page.getByText("DukaPOS")).toBeVisible();
});
