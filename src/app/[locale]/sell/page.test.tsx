import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db/schema";
import { addProduct } from "@/lib/db/products";
import type { Product } from "@/lib/db/schema";
import * as transactions from "@/lib/db/transactions";
import SellPage from "./page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// Scanning internals (camera, barcode lookup, quick-add) are covered by
// ScanToSell.test.tsx — this page only needs to exercise what it owns: the
// tally, payment method, and confirm/checkout wiring around whatever
// ScanToSell hands it.
let capturedOnAddProduct: ((product: Product) => void) | undefined;
vi.mock("@/components/ScanToSell", () => ({
  ScanToSell: ({ onAddProduct }: { onAddProduct: (product: Product) => void }) => {
    capturedOnAddProduct = onAddProduct;
    return <div data-testid="mock-scan-to-sell" />;
  },
}));

const messages = {
  sell: {
    title: "New sale",
    backToHome: "← Home",
    searchPlaceholder: "Search products…",
    quantityLabel: "Quantity for {name}",
    removeButton: "Remove",
    lowStockWarning: "Only {count} left",
    totalLabel: "Total: KES {total}",
    paymentCash: "Cash",
    paymentMpesa: "M-Pesa",
    mpesaSingleItemOnly:
      "M-Pesa checkout is one item at a time — use Cash for multiple items, or remove extra lines.",
    confirmButton: "Confirm sale",
    payWithMpesaButton: "Pay with M-Pesa",
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
    capturedOnAddProduct = undefined;
    vi.restoreAllMocks();
  });

  it("confirm is disabled with zero line items", async () => {
    renderSellPage();

    expect(screen.getByRole("button", { name: "Confirm sale" })).toBeDisabled();
  });

  it("defaults to scan mode, and products ScanToSell hands it land in the tally and reach recordCashSale on confirm", async () => {
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
    const recordCashSaleSpy = vi.spyOn(transactions, "recordCashSale").mockResolvedValue([]);

    const user = userEvent.setup();
    renderSellPage();

    expect(screen.getByTestId("mock-scan-to-sell")).toBeInTheDocument();

    act(() => capturedOnAddProduct!(productA));
    act(() => capturedOnAddProduct!(productB));

    expect(await screen.findByText("Sugar 1kg")).toBeInTheDocument();
    expect(screen.getByText("Bread 400g")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm sale" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Confirm sale" }));

    expect(recordCashSaleSpy).toHaveBeenCalledWith([
      { productId: productA.id, quantity: 1 },
      { productId: productB.id, quantity: 1 },
    ]);
  });

  it("scanning the same product twice increments its quantity instead of adding a second line", async () => {
    const product = await addProduct({
      name: "Sugar 1kg",
      category: "Groceries",
      priceKES: 100,
      stockQty: 10,
      source: "manual",
    });
    renderSellPage();

    act(() => capturedOnAddProduct!(product));
    act(() => capturedOnAddProduct!(product));

    expect(await screen.findByLabelText("Quantity for Sugar 1kg")).toHaveValue(2);
  });
});
