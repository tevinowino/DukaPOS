import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Creates or updates a shop's transaction by its local (Dexie-generated)
 * id. Idempotent on `shopId`+`localId` for the same reason as
 * `products.upsertProduct` — a retried sync must not duplicate rows.
 * Phase 8 also relies on this idempotency for the Paystack webhook's
 * completion write (which can be delivered more than once).
 */
export const upsertTransaction = mutation({
  args: {
    shopId: v.string(),
    localId: v.string(),
    productId: v.string(),
    productName: v.string(),
    quantity: v.number(),
    totalKES: v.number(),
    paymentMethod: v.union(v.literal("cash"), v.literal("mpesa")),
    status: v.union(v.literal("completed"), v.literal("pending"), v.literal("failed")),
    createdAt: v.number(),
    saleGroupId: v.string(),
    reference: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("transactions")
      .withIndex("by_shop_and_local_id", (q) =>
        q.eq("shopId", args.shopId).eq("localId", args.localId),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, args);
      return existing._id;
    }
    return await ctx.db.insert("transactions", args);
  },
});

/** Lists every transaction synced for a shop. Unpaginated — see `products.listByShop`'s note. */
export const listByShop = query({
  args: { shopId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("transactions")
      .withIndex("by_shop", (q) => q.eq("shopId", args.shopId))
      .collect();
  },
});

/**
 * Looks up a transaction by its Paystack charge reference, scoped to a
 * shop. Polled from `/api/checkout/status` (ADR-3) to learn when a
 * webhook has marked an M-Pesa sale completed. Returns `null` if no
 * transaction with that reference exists yet (Convex queries return
 * `null`, not `undefined`, for "no match").
 */
export const getByReference = query({
  args: { shopId: v.string(), reference: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("transactions")
      .withIndex("by_shop_and_reference", (q) =>
        q.eq("shopId", args.shopId).eq("reference", args.reference),
      )
      .unique();
  },
});

/**
 * Writes a `pending` M-Pesa transaction, called by `/api/checkout` right
 * after a Paystack charge is initiated. `localId` is the same value the
 * client will use for this transaction's Dexie row (and `reference` is
 * the Paystack charge reference) — unifying these means the client's own
 * later sync of the same transaction (once it also has it in Dexie)
 * upserts onto this exact row instead of creating a duplicate.
 */
export const markPending = mutation({
  args: {
    shopId: v.string(),
    localId: v.string(),
    productId: v.string(),
    productName: v.string(),
    quantity: v.number(),
    totalKES: v.number(),
    saleGroupId: v.string(),
    reference: v.string(),
    createdAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("transactions")
      .withIndex("by_shop_and_local_id", (q) =>
        q.eq("shopId", args.shopId).eq("localId", args.localId),
      )
      .unique();

    const transaction = {
      shopId: args.shopId,
      localId: args.localId,
      productId: args.productId,
      productName: args.productName,
      quantity: args.quantity,
      totalKES: args.totalKES,
      paymentMethod: "mpesa" as const,
      status: "pending" as const,
      createdAt: args.createdAt,
      saleGroupId: args.saleGroupId,
      reference: args.reference,
    };

    if (existing) {
      await ctx.db.patch(existing._id, transaction);
      return existing._id;
    }
    return await ctx.db.insert("transactions", transaction);
  },
});

/**
 * Flips a `pending` M-Pesa transaction to `completed` and decrements the
 * matching product's stock — called by the (signature-verified)
 * `/api/webhooks/paystack` route once Paystack confirms a charge
 * succeeded. Idempotent on `reference`: a webhook retry for an
 * already-completed transaction is a safe no-op, since Paystack is
 * documented to retry webhook delivery and a second decrement would
 * double-charge the shop's stock for one sale. A `reference` with no
 * matching transaction at all is also a safe no-op, not a crash (the
 * `pending` row should always exist first via `markPending`, but a
 * misdirected or delayed webhook shouldn't be able to throw).
 *
 * Mirrors (does not import) the clamp-at-zero logic in
 * `src/lib/db/products.ts`'s `applyStockDelta` — Convex functions can't
 * import that Dexie-bound module. Keep the two implementations'
 * *behavior* identical if either changes.
 */
export const markCompleted = mutation({
  args: { shopId: v.string(), reference: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("transactions")
      .withIndex("by_shop_and_reference", (q) =>
        q.eq("shopId", args.shopId).eq("reference", args.reference),
      )
      .unique();

    if (!existing || existing.status === "completed") {
      return existing?._id ?? null;
    }

    await ctx.db.patch(existing._id, { status: "completed" });

    const product = await ctx.db
      .query("products")
      .withIndex("by_shop_and_local_id", (q) =>
        q.eq("shopId", args.shopId).eq("localId", existing.productId),
      )
      .unique();
    if (product) {
      await ctx.db.patch(product._id, {
        stockQty: Math.max(0, product.stockQty - existing.quantity),
      });
    }

    return existing._id;
  },
});
