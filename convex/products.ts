import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Creates or updates a shop's product by its local (Dexie-generated) id.
 * Idempotent: calling this twice with the same `shopId`+`localId` patches
 * the existing row instead of inserting a duplicate, so a retried sync
 * (e.g. after a network blip mid-request) is safe.
 */
export const upsertProduct = mutation({
  args: {
    shopId: v.string(),
    localId: v.string(),
    name: v.string(),
    category: v.string(),
    barcode: v.optional(v.string()),
    priceKES: v.number(),
    stockQty: v.number(),
    source: v.union(v.literal("barcode"), v.literal("photo"), v.literal("manual")),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("products")
      .withIndex("by_shop_and_local_id", (q) =>
        q.eq("shopId", args.shopId).eq("localId", args.localId),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, args);
      return existing._id;
    }
    return await ctx.db.insert("products", args);
  },
});

/**
 * Lists every product synced for a shop. Unpaginated: a single duka's
 * catalog is expected to stay in the tens-to-low-hundreds, well under
 * Convex's per-query read limits — revisit with pagination if that
 * assumption stops holding.
 */
export const listByShop = query({
  args: { shopId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("products")
      .withIndex("by_shop", (q) => q.eq("shopId", args.shopId))
      .collect();
  },
});
