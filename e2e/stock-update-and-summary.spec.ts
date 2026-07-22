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

test("parse a natural-language stock update, apply it, and generate a summary", async ({
  page,
}) => {
  await completeOnboarding(page);

  // Seed a product through the real Phase 3 UI.
  await page.getByRole("link", { name: "View stock" }).click();
  await page.getByRole("link", { name: "Add product" }).first().click();
  await page.getByRole("button", { name: "Add manually" }).click();
  await page.getByLabel("Product name").fill("Sugar 1kg");
  await page.getByLabel("Price (KES)").fill("150");
  await page.getByLabel("Stock quantity").fill("20");
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByText("20 in stock")).toBeVisible();

  // Mocked at the network boundary — doesn't depend on the real Gemma API.
  // Note: /api/parse-stock returns the already-normalized StockUpdate shape
  // (productId), not Gemma's raw internal field name (matchedProductId) —
  // that normalization happens inside lib/ai/providers/hosted.ts, upstream
  // of this route.
  await page.route("**/api/parse-stock", async (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}") as {
      existingProducts?: { id: string; name: string }[];
    };
    const sugar = body.existingProducts?.find((product) => product.name === "Sugar 1kg");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        updates: [
          {
            productId: sugar?.id,
            productNameGuess: "Sugar 1kg",
            quantityDelta: 5,
            direction: "decrease",
          },
        ],
      }),
    });
  });
  await page.route("**/api/summary", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ summary: "You sold 5 units of Sugar 1kg today, totalling KES 750." }),
    });
  });

  await page.getByRole("link", { name: "← Home" }).click();
  await page.getByRole("link", { name: "Update stock (text)" }).click();

  await page.getByLabel("Describe what changed").fill("sold 5 sugar");
  await page.getByRole("button", { name: "Parse update" }).click();

  await expect(page.getByText("Sugar 1kg")).toBeVisible();
  await page.getByRole("button", { name: /Apply 1 changes/ }).click();
  await expect(page.getByText("Updated 1 products.")).toBeVisible();

  await page.getByRole("link", { name: "← Home" }).click();
  await page.getByRole("link", { name: "View stock" }).click();
  await expect(page.getByText("15 in stock")).toBeVisible();

  await page.getByRole("link", { name: "← Home" }).click();
  await page.getByRole("link", { name: "Today's summary" }).click();
  await page.getByRole("button", { name: "Generate summary" }).click();
  await expect(
    page.getByText("You sold 5 units of Sugar 1kg today, totalling KES 750."),
  ).toBeVisible();
});
