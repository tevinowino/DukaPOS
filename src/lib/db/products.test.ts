import { beforeEach, describe, expect, it } from "vitest";
import { db } from "./schema";
import {
  addProduct,
  deleteProduct,
  getProductByBarcode,
  getStockStatus,
  isAvailable,
  listProducts,
  matchProductByName,
  updateProduct,
} from "./products";
import type { Product } from "./schema";

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

  it("getStockStatus classifies 0 as out, 1 through 5 as low, and 6+ as good", () => {
    expect(getStockStatus(0)).toBe("out");
    expect(getStockStatus(1)).toBe("low");
    expect(getStockStatus(5)).toBe("low");
    expect(getStockStatus(6)).toBe("good");
    expect(getStockStatus(200)).toBe("good");
  });

  it("isAvailable treats an undefined `available` field as available (pre-migration products)", () => {
    const product: Product = {
      id: "p1",
      name: "Sugar 1kg",
      category: "Groceries",
      priceKES: 100,
      stockQty: 10,
      source: "manual",
    };
    expect(isAvailable(product)).toBe(true);
  });

  it("isAvailable respects an explicit true/false `available` field", () => {
    const base: Product = {
      id: "p1",
      name: "Sugar 1kg",
      category: "Groceries",
      priceKES: 100,
      stockQty: 10,
      source: "manual",
    };
    expect(isAvailable({ ...base, available: true })).toBe(true);
    expect(isAvailable({ ...base, available: false })).toBe(false);
  });

  describe("matchProductByName", () => {
    const products: Product[] = [
      { id: "p1", name: "Red Bull 250ml", category: "Drinks", priceKES: 150, stockQty: 10, source: "barcode" },
      { id: "p2", name: "Blueband Margarine 500g", category: "Groceries", priceKES: 320, stockQty: 5, source: "barcode" },
      { id: "p3", name: "Matchbox", category: "Household", priceKES: 10, stockQty: 40, source: "manual" },
    ];

    it("returns the exact case-insensitive name match when one exists", () => {
      expect(matchProductByName("red bull 250ml", products)).toEqual(products[0]);
    });

    it("returns the product sharing the most word-tokens when there's no exact match", () => {
      expect(matchProductByName("Blueband Margarine", products)).toEqual(products[1]);
    });

    it("returns undefined when no product shares any word-token with the guess", () => {
      expect(matchProductByName("Cooking Oil 1L", products)).toBeUndefined();
    });

    it("returns undefined for an empty product list", () => {
      expect(matchProductByName("Red Bull", [])).toBeUndefined();
    });
  });
});
