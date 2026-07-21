import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { ProductForm } from "./ProductForm";

const messages = {
  productForm: {
    nameLabel: "Product name",
    categoryLabel: "Category",
    barcodeLabel: "Barcode (optional)",
    priceLabel: "Price (KES)",
    stockLabel: "Stock quantity",
    nameRequired: "Enter a product name",
    priceInvalid: "Enter a valid price (whole KES, 0 or more)",
    stockInvalid: "Enter a valid stock quantity (whole number, 0 or more)",
    barcodeInvalid: "Barcode should be numbers only",
    saveButton: "Save product",
    saveChangesButton: "Save changes",
  },
};

function renderForm(props: Partial<React.ComponentProps<typeof ProductForm>> = {}) {
  const onSubmit = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ProductForm mode="create" onSubmit={onSubmit} {...props} />
    </NextIntlClientProvider>,
  );
  return { onSubmit };
}

describe("ProductForm", () => {
  it("submits normalized values when all fields are valid", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.type(screen.getByLabelText("Product name"), "Cooking Oil 1L");
    await user.type(screen.getByLabelText("Price (KES)"), "320");
    await user.type(screen.getByLabelText("Stock quantity"), "15");
    await user.click(screen.getByRole("button", { name: "Save product" }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: "Cooking Oil 1L",
      category: "",
      barcode: undefined,
      priceKES: 320,
      stockQty: 15,
    });
  });

  it("shows a validation error and does not submit when priceKES is negative", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.type(screen.getByLabelText("Product name"), "Cooking Oil 1L");
    await user.type(screen.getByLabelText("Price (KES)"), "-5");
    await user.type(screen.getByLabelText("Stock quantity"), "15");
    await user.click(screen.getByRole("button", { name: "Save product" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("valid price");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows a validation error and does not submit when name is empty", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.type(screen.getByLabelText("Price (KES)"), "100");
    await user.type(screen.getByLabelText("Stock quantity"), "5");
    await user.click(screen.getByRole("button", { name: "Save product" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Enter a product name");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("pre-fills all fields from initialValues in edit mode", () => {
    renderForm({
      mode: "edit",
      initialValues: {
        name: "Sugar 1kg",
        category: "Groceries",
        barcode: "6009123456789",
        priceKES: 150,
        stockQty: 20,
      },
    });

    expect(screen.getByLabelText("Product name")).toHaveValue("Sugar 1kg");
    expect(screen.getByLabelText("Category")).toHaveValue("Groceries");
    expect(screen.getByLabelText("Barcode (optional)")).toHaveValue("6009123456789");
    expect(screen.getByLabelText("Price (KES)")).toHaveValue("150");
    expect(screen.getByLabelText("Stock quantity")).toHaveValue("20");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
  });
});
