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

/**
 * Mocked at the network boundary for /api/checkout and
 * /api/checkout/status, not run against Paystack's real sandbox, even
 * though real sandbox credentials are available in this environment
 * (see this phase's overview.md): (1) there's no real phone available to
 * approve a real STK push, so an automated "success" path is impossible
 * to observe live regardless; (2) Paystack's own guidance is to wait 10s+
 * before polling a real charge's status, which would make this test slow
 * and rate-limit-sensitive for no additional coverage, since the
 * checkout/webhook/status *logic* is already covered by real (unmocked)
 * sandbox verification done manually for this phase (see overview.md)
 * and by the unit tests against mocked Convex/Paystack boundaries.
 */
test("pay with M-Pesa for a single item, observe the waiting screen, and see stock deducted on completion", async ({
  page,
}) => {
  await completeOnboarding(page);

  await page.getByRole("link", { name: "View stock" }).click();
  await page.getByRole("link", { name: "Add product" }).first().click();
  await page.getByRole("button", { name: "Add manually" }).click();
  await page.getByLabel("Product name").fill("Sugar 1kg");
  await page.getByLabel("Price (KES)").fill("150");
  await page.getByLabel("Stock quantity").fill("20");
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByText("20 in stock")).toBeVisible();

  await page.route("**/api/checkout", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ reference: "e2e-test-ref", displayText: "Check your phone" }),
    });
  });

  let pollCount = 0;
  await page.route("**/api/checkout/status*", async (route) => {
    pollCount += 1;
    // Resolve as completed on the second poll — proves the waiting UI
    // actually polls (not just trusts the first response) without
    // padding the test with a full 3s real interval wait.
    const status = pollCount >= 2 ? "completed" : "pending";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status }),
    });
  });

  await page.getByRole("link", { name: "← Home" }).click();
  await page.getByRole("link", { name: "New sale" }).click();
  // New sale defaults to the Barcode tab (no camera in CI) — switch to the Search tab.
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByText("Sugar 1kg").click();

  await page.getByRole("button", { name: "M-Pesa" }).click();
  await page.getByRole("button", { name: "Pay with M-Pesa" }).click();

  await expect(page.getByRole("heading", { name: "Pay with M-Pesa" })).toBeVisible();
  await expect(page.getByText("Sugar 1kg × 1 — KES 150")).toBeVisible();

  await page.getByRole("button", { name: "Send payment request" }).click();

  await expect(page.getByText("Check your phone")).toBeVisible();

  await expect(page.getByText("Payment received — sale complete.")).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole("link", { name: "← Home" }).click();
  await page.getByRole("link", { name: "View stock" }).click();
  await expect(page.getByText("19 in stock")).toBeVisible();
});
