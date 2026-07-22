// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

interface TransactionArgsOverrides {
  shopId?: string;
  localId?: string;
  paymentMethod?: "cash" | "mpesa";
  status?: "completed" | "pending" | "failed";
  quantity?: number;
  reference?: string;
}

function baseTransactionArgs(overrides: TransactionArgsOverrides = {}) {
  return {
    shopId: "shop-a",
    localId: "txn-1",
    productId: "product-1",
    productName: "Sugar 1kg",
    quantity: 2,
    totalKES: 300,
    paymentMethod: "cash" as const,
    status: "completed" as const,
    createdAt: 1700000000000,
    saleGroupId: "sale-1",
    ...overrides,
  };
}

describe("transactions", () => {
  test("upsertTransaction is idempotent on shopId+localId — no duplicate row", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(api.transactions.upsertTransaction, baseTransactionArgs());
    await t.mutation(
      api.transactions.upsertTransaction,
      baseTransactionArgs({ status: "completed", quantity: 2 }),
    );

    const rows = await t.query(api.transactions.listByShop, { shopId: "shop-a" });
    expect(rows).toHaveLength(1);
  });

  test("listByShop never returns another shop's transactions", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(
      api.transactions.upsertTransaction,
      baseTransactionArgs({ shopId: "shop-a", localId: "txn-a" }),
    );
    await t.mutation(
      api.transactions.upsertTransaction,
      baseTransactionArgs({ shopId: "shop-b", localId: "txn-b" }),
    );

    const shopARows = await t.query(api.transactions.listByShop, { shopId: "shop-a" });
    expect(shopARows).toHaveLength(1);
    expect(shopARows[0].localId).toBe("txn-a");

    const shopBRows = await t.query(api.transactions.listByShop, { shopId: "shop-b" });
    expect(shopBRows).toHaveLength(1);
    expect(shopBRows[0].localId).toBe("txn-b");
  });

  test("getByReference returns null for a reference that was never upserted", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(api.transactions.upsertTransaction, baseTransactionArgs());

    const result = await t.query(api.transactions.getByReference, {
      shopId: "shop-a",
      reference: "never-seen-reference",
    });
    // Convex queries return `null`, not `undefined`, for "no match" (undefined
    // isn't a valid Convex value) — see convex/_generated/ai/guidelines.md.
    expect(result).toBeNull();
  });

  test("getByReference finds a transaction by its Paystack reference, scoped to the shop", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(
      api.transactions.upsertTransaction,
      baseTransactionArgs({ paymentMethod: "mpesa", status: "pending", reference: "psk_ref_123" }),
    );

    const result = await t.query(api.transactions.getByReference, {
      shopId: "shop-a",
      reference: "psk_ref_123",
    });
    expect(result?.localId).toBe("txn-1");
  });
});

describe("markPending / markCompleted (Phase 8)", () => {
  async function seedPendingMpesaSale(t: ReturnType<typeof convexTest>) {
    await t.mutation(api.products.upsertProduct, {
      shopId: "shop-a",
      localId: "product-1",
      name: "Sugar 1kg",
      category: "Groceries",
      priceKES: 150,
      stockQty: 20,
      source: "manual",
    });
    await t.mutation(api.transactions.markPending, {
      shopId: "shop-a",
      localId: "mpesa-txn-1",
      productId: "product-1",
      productName: "Sugar 1kg",
      quantity: 3,
      totalKES: 450,
      saleGroupId: "sale-mpesa-1",
      reference: "psk_ref_abc",
      createdAt: 1700000000000,
    });
  }

  test("markPending writes a pending mpesa transaction findable by reference", async () => {
    const t = convexTest(schema, modules);
    await seedPendingMpesaSale(t);

    const found = await t.query(api.transactions.getByReference, {
      shopId: "shop-a",
      reference: "psk_ref_abc",
    });
    expect(found).toMatchObject({
      status: "pending",
      paymentMethod: "mpesa",
      quantity: 3,
      totalKES: 450,
    });
  });

  test("markCompleted flips status to completed and decrements stock exactly once, even if called twice", async () => {
    const t = convexTest(schema, modules);
    await seedPendingMpesaSale(t);

    await t.mutation(api.transactions.markCompleted, { shopId: "shop-a", reference: "psk_ref_abc" });
    await t.mutation(api.transactions.markCompleted, { shopId: "shop-a", reference: "psk_ref_abc" });

    const transaction = await t.query(api.transactions.getByReference, {
      shopId: "shop-a",
      reference: "psk_ref_abc",
    });
    expect(transaction?.status).toBe("completed");

    const products = await t.query(api.products.listByShop, { shopId: "shop-a" });
    const product = products.find((p) => p.localId === "product-1");
    // Started at 20, sold 3 — must be 17, not 14 (which a double-decrement would produce).
    expect(product?.stockQty).toBe(17);
  });

  test("markCompleted for a reference with no matching transaction is a safe no-op, not a crash", async () => {
    const t = convexTest(schema, modules);

    const result = await t.mutation(api.transactions.markCompleted, {
      shopId: "shop-a",
      reference: "never-seen-reference",
    });
    expect(result).toBeNull();
  });
});
