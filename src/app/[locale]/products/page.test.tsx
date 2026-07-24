import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db/schema";
import { addProduct } from "@/lib/db/products";
import ProductsPage from "./page";

vi.mock("next/navigation", () => ({
  usePathname: () => "/products",
}));

const messages = {
  products: {
    title: "Stock",
    backToHome: "← Home",
    addButton: "Add product",
    emptyTitle: "No products yet",
    emptyBody: "Add your first product to get started.",
    inStock: "{count} in stock",
    outOfStock: "Out of stock",
    unavailableBadge: "Unavailable",
    searchPlaceholder: "Search inventory…",
    filterAll: "All",
    filterLowStock: "Low Stock",
    filterOutOfStock: "Out of Stock",
    noResultsFound: "No products match your search.",
  },
  bottomNav: {
    sales: "Sales",
    inventory: "Inventory",
    reports: "Reports",
  },
};

function renderProductsPage() {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ProductsPage />
    </NextIntlClientProvider>,
  );
}

describe("ProductsPage", () => {
  beforeEach(async () => {
    await db.products.clear();
  });

  it("renders each seeded product's name and stock quantity", async () => {
    await addProduct({
      name: "Sugar 1kg",
      category: "Groceries",
      priceKES: 150,
      stockQty: 20,
      source: "manual",
    });
    await addProduct({
      name: "Cooking Oil 1L",
      category: "Groceries",
      priceKES: 320,
      stockQty: 5,
      source: "manual",
    });

    renderProductsPage();

    expect(await screen.findByText("Sugar 1kg")).toBeInTheDocument();
    expect(screen.getByText("20 in stock")).toBeInTheDocument();
    expect(screen.getByText("Cooking Oil 1L")).toBeInTheDocument();
    expect(screen.getByText("5 in stock")).toBeInTheDocument();
  });

  it("shows an Unavailable badge only for products marked unavailable", async () => {
    await addProduct({
      name: "Sugar 1kg",
      category: "Groceries",
      priceKES: 150,
      stockQty: 20,
      source: "manual",
      available: true,
    });
    await addProduct({
      name: "Imported Chocolate",
      category: "Snacks",
      priceKES: 250,
      stockQty: 0,
      source: "manual",
      available: false,
    });

    renderProductsPage();

    await screen.findByText("Sugar 1kg");
    const availableItem = screen.getByText("Sugar 1kg").closest("a")!;
    const unavailableItem = screen.getByText("Imported Chocolate").closest("a")!;
    expect(availableItem).not.toHaveTextContent("Unavailable");
    expect(unavailableItem).toHaveTextContent("Unavailable");
  });

  it("renders the empty-state call-to-action when there are no products", async () => {
    renderProductsPage();

    expect(await screen.findByText("No products yet")).toBeInTheDocument();
    expect(screen.getByText("Add your first product to get started.")).toBeInTheDocument();
  });

  it("filters the list by name as the shopkeeper types in the search box", async () => {
    await addProduct({
      name: "Sugar 1kg",
      category: "Groceries",
      priceKES: 150,
      stockQty: 20,
      source: "manual",
    });
    await addProduct({
      name: "Cooking Oil 1L",
      category: "Groceries",
      priceKES: 320,
      stockQty: 5,
      source: "manual",
    });

    const user = userEvent.setup();
    renderProductsPage();
    await screen.findByText("Sugar 1kg");

    await user.type(screen.getByLabelText("Search inventory…"), "sugar");

    expect(screen.getByText("Sugar 1kg")).toBeInTheDocument();
    expect(screen.queryByText("Cooking Oil 1L")).not.toBeInTheDocument();
  });

  it("filters the list to only low-stock or out-of-stock products via the chips", async () => {
    await addProduct({
      name: "Sugar 1kg",
      category: "Groceries",
      priceKES: 150,
      stockQty: 20, // good
      source: "manual",
    });
    await addProduct({
      name: "Bread 400g",
      category: "Bakery",
      priceKES: 60,
      stockQty: 3, // low
      source: "manual",
    });
    await addProduct({
      name: "Milk 500ml",
      category: "Dairy",
      priceKES: 70,
      stockQty: 0, // out
      source: "manual",
    });

    const user = userEvent.setup();
    renderProductsPage();
    await screen.findByText("Sugar 1kg");

    await user.click(screen.getByRole("button", { name: "Low Stock" }));
    expect(screen.getByText("Bread 400g")).toBeInTheDocument();
    expect(screen.queryByText("Sugar 1kg")).not.toBeInTheDocument();
    expect(screen.queryByText("Milk 500ml")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Out of Stock" }));
    expect(screen.getByText("Milk 500ml")).toBeInTheDocument();
    expect(screen.queryByText("Bread 400g")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "All" }));
    expect(screen.getByText("Sugar 1kg")).toBeInTheDocument();
    expect(screen.getByText("Bread 400g")).toBeInTheDocument();
    expect(screen.getByText("Milk 500ml")).toBeInTheDocument();
  });
});
