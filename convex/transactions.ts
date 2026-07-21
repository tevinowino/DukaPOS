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
 * shop. Unused until Phase 8, which polls this from `/api/checkout/status`
 * (ADR-3) to learn when a webhook has marked an M-Pesa sale completed.
 * Returns `null` if no transaction with that reference exists yet (Convex
 * queries return `null`, not `undefined`, for "no match").
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
