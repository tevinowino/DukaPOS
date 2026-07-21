import { beforeEach, describe, expect, it } from "vitest";
import { db } from "./schema";
import {
  addProduct,
  deleteProduct,
  getProductByBarcode,
  listProducts,
  updateProduct,
} from "./products";

describe("products", () => {
  beforeEach(async () => {
    await db.products.clear();
  });

  it("addProduct persists a product and listProducts returns it", async () => {
    const saved = await addProduct({
      name: "Sugar 1kg",
      category: "Groceries",
      priceKES: 150,
      stockQty: 20,
      source: "manual",
    });

    const all = await listProducts();

    expect(saved.id).toEqual(expect.any(String));
    expect(all).toEqual([
      {
        id: saved.id,
        name: "Sugar 1kg",
        category: "Groceries",
        priceKES: 150,
        stockQty: 20,
        source: "manual",
      },
    ]);
  });

  it("updateProduct changes stockQty and leaves other fields untouched", async () => {
    const saved = await addProduct({
      name: "Cooking Oil 1L",
      category: "Groceries",
      priceKES: 320,
      stockQty: 15,
      source: "manual",
    });

    await updateProduct(saved.id, { stockQty: 12 });

    const [updated] = await listProducts();
    expect(updated).toEqual({ ...saved, stockQty: 12 });
  });

  it("deleteProduct removes a product from listProducts", async () => {
    const saved = await addProduct({
      name: "Bread 400g",
      category: "Bakery",
      priceKES: 60,
      stockQty: 8,
      source: "manual",
    });

    await deleteProduct(saved.id);

    expect(await listProducts()).toEqual([]);
  });

  it("listProducts returns [] on a fresh empty database", async () => {
    expect(await listProducts()).toEqual([]);
  });

  it("allows two products to share the same barcode (no uniqueness constraint)", async () => {
    const first = await addProduct({
      name: "Soap Bar A",
      category: "Household",
      barcode: "6009123456789",
      priceKES: 50,
      stockQty: 10,
      source: "barcode",
    });
    const second = await addProduct({
      name: "Soap Bar B",
      category: "Household",
      barcode: "6009123456789",
      priceKES: 55,
      stockQty: 5,
      source: "barcode",
    });

    const all = await listProducts();
    expect(all).toHaveLength(2);
    expect(all.map((p) => p.id).sort()).toEqual([first.id, second.id].sort());
  });

  it("getProductByBarcode returns the matching product", async () => {
    const saved = await addProduct({
      name: "Cooking Fat 500g",
      category: "Groceries",
      barcode: "6009123456789",
      priceKES: 180,
      stockQty: 12,
      source: "barcode",
    });

    expect(await getProductByBarcode("6009123456789")).toEqual(saved);
  });

  it("getProductByBarcode returns undefined for a barcode nothing was saved with", async () => {
    expect(await getProductByBarcode("0000000000000")).toBeUndefined();
  });
});
