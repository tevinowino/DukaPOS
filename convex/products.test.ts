// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("products", () => {
  test("upsertProduct is idempotent on shopId+localId — the second call's values win, no duplicate row", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(api.products.upsertProduct, {
      shopId: "shop-a",
      localId: "product-1",
      name: "Sugar 1kg",
      category: "Groceries",
      priceKES: 150,
      stockQty: 20,
      source: "manual",
    });
    await t.mutation(api.products.upsertProduct, {
      shopId: "shop-a",
      localId: "product-1",
      name: "Sugar 1kg",
      category: "Groceries",
      priceKES: 150,
      stockQty: 12,
      source: "manual",
    });

    const products = await t.query(api.products.listByShop, { shopId: "shop-a" });
    expect(products).toHaveLength(1);
    expect(products[0].stockQty).toBe(12);
  });

  test("listByShop never returns another shop's products", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(api.products.upsertProduct, {
      shopId: "shop-a",
      localId: "product-1",
      name: "Sugar 1kg",
      category: "Groceries",
      priceKES: 150,
      stockQty: 20,
      source: "manual",
    });
    await t.mutation(api.products.upsertProduct, {
      shopId: "shop-b",
      localId: "product-2",
      name: "Bread 400g",
      category: "Bakery",
      priceKES: 60,
      stockQty: 5,
      source: "manual",
    });

    const shopAProducts = await t.query(api.products.listByShop, { shopId: "shop-a" });
    expect(shopAProducts).toHaveLength(1);
    expect(shopAProducts[0].name).toBe("Sugar 1kg");

    const shopBProducts = await t.query(api.products.listByShop, { shopId: "shop-b" });
    expect(shopBProducts).toHaveLength(1);
    expect(shopBProducts[0].name).toBe("Bread 400g");
  });
});
