import { beforeEach, describe, expect, it } from "vitest";
import { db } from "./schema";
import { addProduct } from "./products";
import { deductStock, groupTransactionsBySale, listTransactions, recordCashSale } from "./transactions";

describe("transactions", () => {
  beforeEach(async () => {
    await db.products.clear();
    await db.transactions.clear();
  });

  it("recordCashSale deducts stock and records a completed cash transaction", async () => {
    const product = await addProduct({
      name: "Sugar 1kg",
      category: "Groceries",
      priceKES: 100,
      stockQty: 10,
      source: "manual",
    });

    const recorded = await recordCashSale([{ productId: product.id, quantity: 2 }]);

    const updated = await db.products.get(product.id);
    expect(updated?.stockQty).toBe(8);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      productId: product.id,
      productName: "Sugar 1kg",
      quantity: 2,
      totalKES: 200,
      paymentMethod: "cash",
      status: "completed",
    });
  });

  it("recordCashSale handles a multi-item sale with correct per-line totals and stock", async () => {
    const productA = await addProduct({
      name: "Sugar 1kg",
      category: "Groceries",
      priceKES: 100,
      stockQty: 10,
      source: "manual",
    });
    const productB = await addProduct({
      name: "Bread 400g",
      category: "Bakery",
      priceKES: 60,
      stockQty: 5,
      source: "manual",
    });

    const recorded = await recordCashSale([
      { productId: productA.id, quantity: 1 },
      { productId: productB.id, quantity: 3 },
    ]);

    expect(recorded).toHaveLength(2);
    expect((await db.products.get(productA.id))?.stockQty).toBe(9);
    expect((await db.products.get(productB.id))?.stockQty).toBe(2);
    expect(recorded.find((t) => t.productId === productA.id)?.totalKES).toBe(100);
    expect(recorded.find((t) => t.productId === productB.id)?.totalKES).toBe(180);
    // Both lines belong to the same sale.
    expect(recorded[0].saleGroupId).toBe(recorded[1].saleGroupId);
  });

  it("deductStock clamps at zero rather than going negative", async () => {
    const product = await addProduct({
      name: "Cooking Oil 1L",
      category: "Groceries",
      priceKES: 320,
      stockQty: 3,
      source: "manual",
    });

    await deductStock(product.id, 10);

    expect((await db.products.get(product.id))?.stockQty).toBe(0);
  });

  it("applies two sequential sales of the same product independently", async () => {
    const product = await addProduct({
      name: "Rice 2kg",
      category: "Groceries",
      priceKES: 250,
      stockQty: 20,
      source: "manual",
    });

    await recordCashSale([{ productId: product.id, quantity: 3 }]);
    await recordCashSale([{ productId: product.id, quantity: 2 }]);

    expect((await db.products.get(product.id))?.stockQty).toBe(15);
    const all = await db.transactions.where("productId").equals(product.id).toArray();
    expect(all).toHaveLength(2);
  });

  it("listTransactions returns only today's rows when a transaction from another date is also seeded", async () => {
    const product = await addProduct({
      name: "Sugar 1kg",
      category: "Groceries",
      priceKES: 100,
      stockQty: 10,
      source: "manual",
    });

    await recordCashSale([{ productId: product.id, quantity: 1 }]);

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    await db.transactions.add({
      id: "yesterday-txn",
      productId: product.id,
      productName: "Sugar 1kg",
      quantity: 1,
      totalKES: 100,
      paymentMethod: "cash",
      status: "completed",
      createdAt: yesterday.getTime(),
      saleGroupId: "yesterday-sale",
    });

    const todaysTransactions = await listTransactions({ date: new Date() });
    expect(todaysTransactions).toHaveLength(1);
    expect(todaysTransactions[0].saleGroupId).not.toBe("yesterday-sale");
  });

  it("groupTransactionsBySale groups multi-line sales and sums totals, newest first", () => {
    const grouped = groupTransactionsBySale([
      {
        id: "t1",
        productId: "p1",
        productName: "Sugar 1kg",
        quantity: 1,
        totalKES: 100,
        paymentMethod: "cash",
        status: "completed",
        createdAt: 1000,
        saleGroupId: "sale-a",
      },
      {
        id: "t2",
        productId: "p2",
        productName: "Bread 400g",
        quantity: 2,
        totalKES: 120,
        paymentMethod: "cash",
        status: "completed",
        createdAt: 1000,
        saleGroupId: "sale-a",
      },
      {
        id: "t3",
        productId: "p1",
        productName: "Sugar 1kg",
        quantity: 1,
        totalKES: 100,
        paymentMethod: "cash",
        status: "completed",
        createdAt: 2000,
        saleGroupId: "sale-b",
      },
    ]);

    expect(grouped).toEqual([
      { saleGroupId: "sale-b", createdAt: 2000, totalKES: 100, lines: [expect.objectContaining({ id: "t3" })] },
      {
        saleGroupId: "sale-a",
        createdAt: 1000,
        totalKES: 220,
        lines: [expect.objectContaining({ id: "t1" }), expect.objectContaining({ id: "t2" })],
      },
    ]);
  });
});
