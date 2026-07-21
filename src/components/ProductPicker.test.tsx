import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db/schema";
import { addProduct } from "@/lib/db/products";
import { ProductPicker } from "./ProductPicker";

const messages = {
  sell: {
    searchPlaceholder: "Search products…",
  },
  products: {
    inStock: "{count} in stock",
    outOfStock: "Out of stock",
  },
};

function renderPicker(onSelect = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ProductPicker onSelect={onSelect} />
    </NextIntlClientProvider>,
  );
  return { onSelect };
}

describe("ProductPicker", () => {
  beforeEach(async () => {
    await db.products.clear();
  });

  it("filters the visible list as the search term changes", async () => {
    await addProduct({
      name: "Sugar 1kg",
      category: "Groceries",
      priceKES: 100,
      stockQty: 10,
      source: "manual",
    });
    await addProduct({
      name: "Bread 400g",
      category: "Bakery",
      priceKES: 60,
      stockQty: 5,
      source: "manual",
    });

    const user = userEvent.setup();
    renderPicker();

    expect(await screen.findByText("Sugar 1kg")).toBeInTheDocument();
    expect(screen.getByText("Bread 400g")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Search products…"), "sugar");

    expect(screen.getByText("Sugar 1kg")).toBeInTheDocument();
    expect(screen.queryByText("Bread 400g")).not.toBeInTheDocument();
  });

  it("shows an out-of-stock indicator for a zero-stock product rather than hiding it", async () => {
    await addProduct({
      name: "Cooking Oil 1L",
      category: "Groceries",
      priceKES: 320,
      stockQty: 0,
      source: "manual",
    });

    renderPicker();

    expect(await screen.findByText("Cooking Oil 1L")).toBeInTheDocument();
    expect(screen.getByText("Out of stock")).toBeInTheDocument();
  });
});
