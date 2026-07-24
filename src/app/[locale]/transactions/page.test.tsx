import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db/schema";
import { addProduct } from "@/lib/db/products";
import TransactionsPage from "./page";

const messages = {
  transactions: {
    title: "Sales",
    backToHome: "← Home",
    prevDay: "← Previous",
    nextDay: "Next →",
    emptyState: "No sales recorded for this day.",
    paymentBreakdownTitle: "By payment method",
    cashCount: "{count} cash sales",
    mpesaCount: "{count} M-Pesa sales",
  },
};

function renderTransactionsPage() {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <TransactionsPage />
    </NextIntlClientProvider>,
  );
}

describe("TransactionsPage", () => {
  beforeEach(async () => {
    await db.products.clear();
    await db.transactions.clear();
  });

  it("shows the no-sales empty state, with no payment breakdown card, when nothing was sold today", async () => {
    renderTransactionsPage();

    expect(await screen.findByText("No sales recorded for this day.")).toBeInTheDocument();
    expect(screen.queryByText("By payment method")).not.toBeInTheDocument();
  });

  it("splits today's completed sales into cash and M-Pesa totals, excluding a pending M-Pesa sale from either total", async () => {
    const product = await addProduct({
      name: "Sugar 1kg",
      category: "Groceries",
      priceKES: 100,
      stockQty: 50,
      source: "manual",
    });
    const today = Date.now();

    await db.transactions.bulkAdd([
      {
        id: "cash-1",
        productId: product.id,
        productName: "Sugar 1kg",
        quantity: 2,
        totalKES: 200,
        paymentMethod: "cash",
        status: "completed",
        createdAt: today,
        saleGroupId: "sale-cash-1",
      },
      {
        id: "mpesa-1",
        productId: product.id,
        productName: "Sugar 1kg",
        quantity: 1,
        totalKES: 100,
        paymentMethod: "mpesa",
        status: "completed",
        createdAt: today,
        saleGroupId: "sale-mpesa-1",
      },
      {
        id: "mpesa-pending",
        productId: product.id,
        productName: "Sugar 1kg",
        quantity: 5,
        totalKES: 500,
        paymentMethod: "mpesa",
        status: "pending",
        createdAt: today,
        saleGroupId: "sale-mpesa-pending",
      },
    ]);

    renderTransactionsPage();

    const breakdownTitle = await screen.findByText("By payment method");
    const breakdownCard = breakdownTitle.closest("div")!.parentElement!;

    expect(within(breakdownCard).getByText("KES 200")).toBeInTheDocument();
    expect(within(breakdownCard).getByText("1 cash sales")).toBeInTheDocument();
    expect(within(breakdownCard).getByText("KES 100")).toBeInTheDocument();
    expect(within(breakdownCard).getByText("1 M-Pesa sales")).toBeInTheDocument();
    // Grand total (300) only sums the two completed sales, not the pending 500.
    expect(within(breakdownCard).getByText("KES 300")).toBeInTheDocument();
  });
});
