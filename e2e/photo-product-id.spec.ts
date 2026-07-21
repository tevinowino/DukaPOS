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

// A minimal valid 1x1 red PNG — real Chromium's createImageBitmap/canvas
// (unlike jsdom) need genuinely decodable image bytes, not an arbitrary buffer.
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

test("photograph a product, confirm the AI guess, edit it, and save", async ({ page }) => {
  await completeOnboarding(page);

  // Mocked at the network boundary — this test doesn't depend on the real
  // Gemma API or a real camera. A short delay makes the "identifying"
  // loading state reliably observable rather than racing a same-tick resolve.
  await page.route("**/api/identify-product", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
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

  await page.getByRole("link", { name: "View stock" }).click();
  await page.getByRole("link", { name: "Add product" }).first().click();
  await page.getByRole("link", { name: "Add via photo" }).click();

  const fileInput = page.getByLabel("Take a photo of the product");
  await fileInput.setInputFiles({
    name: "photo.png",
    mimeType: "image/png",
    buffer: Buffer.from(TINY_PNG_BASE64, "base64"),
  });

  await expect(page.getByText("Identifying product…")).toBeVisible();

  await expect(page.getByRole("heading", { name: "Confirm the details" })).toBeVisible();
  await expect(page.getByLabel("Product name")).toHaveValue("Cooking Oil 1L");
  await expect(page.getByLabel("Category")).toHaveValue("Groceries");
  await expect(page.getByLabel("Price (KES)")).toHaveValue("320");

  // Edit before saving — the edited value must be what's saved, not the guess.
  await page.getByLabel("Product name").fill("Cooking Oil 2L");
  await page.getByLabel("Stock quantity").fill("8");
  await page.getByRole("button", { name: "Save product" }).click();

  await expect(page).toHaveURL(/\/products$/);
  await expect(page.getByText("Cooking Oil 2L")).toBeVisible();
  await expect(page.getByText("Cooking Oil 1L")).toHaveCount(0);
});
