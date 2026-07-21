import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db/schema";
import { addProduct } from "@/lib/db/products";
import ProductsPage from "./page";

const messages = {
  products: {
    title: "Stock",
    addButton: "Add product",
    emptyTitle: "No products yet",
    emptyBody: "Add your first product to get started.",
    inStock: "{count} in stock",
    outOfStock: "Out of stock",
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

  it("renders the empty-state call-to-action when there are no products", async () => {
    renderProductsPage();

    expect(await screen.findByText("No products yet")).toBeInTheDocument();
    expect(screen.getByText("Add your first product to get started.")).toBeInTheDocument();
  });
});
