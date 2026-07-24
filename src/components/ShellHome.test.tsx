import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db/schema";
import { addProduct } from "@/lib/db/products";
import { recordCashSale } from "@/lib/db/transactions";
import { ShellHome } from "./ShellHome";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

const messages = {
  shell: {
    appName: "DukaPOS",
    tagline: "Track stock and sales from your phone",
    newSaleButton: "New sale",
    viewStockButton: "View stock",
    viewSalesButton: "Sales log",
    stockUpdateButton: "Update stock (text)",
    summaryButton: "Today's summary",
    todaysSales: "Today's Sales",
    totalRevenue: "Total revenue",
    stockHealth: "Stock Health",
    stockGood: "Good",
    stockLow: "Low",
    stockOut: "Out",
    recentActivity: "Recent Activity",
    noSalesToday: "No sales recorded yet today.",
  },
  bottomNav: {
    sales: "Sales",
    inventory: "Inventory",
    reports: "Reports",
  },
};

function renderShellHome() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ShellHome />
    </NextIntlClientProvider>,
  );
}

describe("ShellHome", () => {
  beforeEach(async () => {
    await db.products.clear();
    await db.transactions.clear();
  });

  it("renders the tagline and every navigation link, even with an empty shop", async () => {
    renderShellHome();

    // Not asserting on "DukaPOS" text here: in the real app, AppHeader
    // (rendered by AppLockGate, a level above this component) already
    // shows that wordmark on every screen — this component intentionally
    // doesn't repeat it (see its own comment).
    expect(screen.getByText("Track stock and sales from your phone")).toBeInTheDocument();
    expect(await screen.findByText("No sales recorded yet today.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /New sale/ })).toHaveAttribute("href", "/sell");
    expect(screen.getByRole("link", { name: "View stock" })).toHaveAttribute("href", "/products");
    expect(screen.getByRole("link", { name: "Sales log" })).toHaveAttribute("href", "/transactions");
    expect(screen.getByRole("link", { name: "Update stock (text)" })).toHaveAttribute(
      "href",
      "/stock-update",
    );
    expect(screen.getByRole("link", { name: "Today's summary" })).toHaveAttribute(
      "href",
      "/summary",
    );
  });

  it("shows today's revenue, stock health counts, and recent sales computed from real local data", async () => {
    const wellStocked = await addProduct({
      name: "Sugar 1kg",
      category: "Groceries",
      priceKES: 150,
      stockQty: 20,
      source: "manual",
    });
    await addProduct({
      name: "Bread 400g",
      category: "Bakery",
      priceKES: 60,
      stockQty: 3, // low (<= 5)
      source: "manual",
    });
    await addProduct({
      name: "Milk 500ml",
      category: "Dairy",
      priceKES: 70,
      stockQty: 0, // out
      source: "manual",
    });

    await recordCashSale([{ productId: wellStocked.id, quantity: 2 }]);

    renderShellHome();

    // Appears twice by coincidence in this fixture: once as today's total
    // revenue, once as the one sale's own line total in Recent Activity.
    expect(await screen.findAllByText("KSh 300")).toHaveLength(2);
    expect(await screen.findByText("Sugar 1kg")).toBeInTheDocument();

    // Stock health: 1 good (Sugar, 20 left), 1 low (Bread, 3), 1 out (Milk, 0) —
    // all three counts happen to be 1, so asserting there are exactly three
    // "1" badges (good/low/out) confirms each bucket got exactly one product.
    const stockHealthCard = screen.getByText("Stock Health").closest("div")!.parentElement!;
    expect(within(stockHealthCard).getAllByText("1")).toHaveLength(3);
  });
});
