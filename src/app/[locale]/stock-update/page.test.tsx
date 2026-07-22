import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db/schema";
import { addProduct } from "@/lib/db/products";
import * as productsModule from "@/lib/db/products";
import StockUpdatePage from "./page";

const messages = {
  stockUpdate: {
    title: "Update stock",
    backToHome: "← Home",
    inputLabel: "Describe what changed",
    placeholder: "e.g. sold 3 bread",
    parseButton: "Parse update",
    parsing: "Reading your update…",
    parseFailedMessage: "Couldn't read that — try rephrasing it",
    unmatchedProduct: "Couldn't match this to an existing product — add it first, or remove this line.",
    addProductLink: "Add product",
    quantityLabel: "Quantity for {name}",
    quantityPlaceholder: "Qty",
    removeButton: "Remove",
    applyButton: "Apply {count} changes",
    applySuccess: "Updated {count} products.",
    lineApplyFailed: "Couldn't update {name} — it may have been deleted",
  },
};

function renderPage() {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <StockUpdatePage />
    </NextIntlClientProvider>,
  );
}

describe("StockUpdatePage", () => {
  beforeEach(async () => {
    await db.products.clear();
    vi.restoreAllMocks();
  });

  it("renders one editable row per StockUpdate, and applying excludes a removed row", async () => {
    const sugar = await addProduct({
      name: "Sugar 1kg",
      category: "Groceries",
      priceKES: 150,
      stockQty: 20,
      source: "manual",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          updates: [
            {
              productId: sugar.id,
              productNameGuess: "Sugar 1kg",
              quantityDelta: 3,
              direction: "decrease",
            },
            {
              productNameGuess: "phone chargers",
              quantityDelta: 2,
              direction: "decrease",
            },
          ],
        }),
      }),
    );
    const applyStockDeltaSpy = vi
      .spyOn(productsModule, "applyStockDelta")
      .mockResolvedValue(undefined);

    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Describe what changed"), "sold 3 sugar, sold 2 chargers");
    await user.click(screen.getByRole("button", { name: "Parse update" }));

    expect(await screen.findByText("Sugar 1kg")).toBeInTheDocument();
    expect(screen.getByText("phone chargers")).toBeInTheDocument();

    // Remove the unmatched line before applying.
    const removeButtons = screen.getAllByRole("button", { name: "Remove" });
    await user.click(removeButtons[1]);

    expect(screen.queryByText("phone chargers")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Apply 1 changes/ }));

    expect(applyStockDeltaSpy).toHaveBeenCalledTimes(1);
    expect(applyStockDeltaSpy).toHaveBeenCalledWith(sugar.id, -3);
  });
});
