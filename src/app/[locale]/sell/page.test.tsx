import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db/schema";
import { addProduct } from "@/lib/db/products";
import * as transactions from "@/lib/db/transactions";
import SellPage from "./page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const messages = {
  sell: {
    title: "New sale",
    backToHome: "← Home",
    addProductButton: "Add product",
    searchPlaceholder: "Search products…",
    quantityLabel: "Quantity for {name}",
    removeButton: "Remove",
    lowStockWarning: "Only {count} left",
    totalLabel: "Total: KES {total}",
    paymentCash: "Cash",
    paymentMpesaComingSoon: "M-Pesa (coming soon)",
    confirmButton: "Confirm sale",
  },
  products: {
    inStock: "{count} in stock",
    outOfStock: "Out of stock",
  },
};

function renderSellPage() {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SellPage />
    </NextIntlClientProvider>,
  );
}

describe("SellPage", () => {
  beforeEach(async () => {
    await db.products.clear();
    vi.restoreAllMocks();
  });

  it("confirm is disabled with zero line items", async () => {
    renderSellPage();

    expect(screen.getByRole("button", { name: "Confirm sale" })).toBeDisabled();
  });

  it("adding two product lines and confirming calls recordCashSale with exactly those two line items", async () => {
    const productA = await addProduct({
      name: "Sugar 1kg",
      category: "Groceries",
      priceKES: 100,
      stockQty: 10,
      source: "manual",
    });
    const productB = await addProduct({
      name: "Bread 400g",
      category: "Bakery",
      priceKES: 60,
      stockQty: 5,
      source: "manual",
    });
    const recordCashSaleSpy = vi
      .spyOn(transactions, "recordCashSale")
      .mockResolvedValue([]);

    const user = userEvent.setup();
    renderSellPage();

    await user.click(screen.getByRole("button", { name: "Add product" }));
    await user.click(await screen.findByText("Sugar 1kg"));
    await user.click(screen.getByRole("button", { name: "Add product" }));
    await user.click(await screen.findByText("Bread 400g"));

    expect(screen.getByRole("button", { name: "Confirm sale" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Confirm sale" }));

    expect(recordCashSaleSpy).toHaveBeenCalledWith([
      { productId: productA.id, quantity: 1 },
      { productId: productB.id, quantity: 1 },
    ]);
  });
});
