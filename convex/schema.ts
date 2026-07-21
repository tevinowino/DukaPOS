import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Mirrors the local Dexie `Product`/`Transaction` shapes (see
 * src/lib/db/schema.ts), plus `shopId` on every table (ADR-2: there is no
 * server session, so every row must carry the tenant key explicitly —
 * global-rules §5.1) and `localId` (the Dexie-generated `id`, kept
 * distinct from Convex's own `_id` system field) so upserts can be
 * idempotent on retry.
 */
export default defineSchema({
  products: defineTable({
    shopId: v.string(),
    localId: v.string(),
    name: v.string(),
    category: v.string(),
    barcode: v.optional(v.string()),
    priceKES: v.number(),
    stockQty: v.number(),
    source: v.union(v.literal("barcode"), v.literal("photo"), v.literal("manual")),
  })
    .index("by_shop", ["shopId"])
    .index("by_shop_and_local_id", ["shopId", "localId"]),

  transactions: defineTable({
    shopId: v.string(),
    localId: v.string(),
    /** The Dexie-local product id — an opaque string, not a Convex `products` FK. */
    productId: v.string(),
    productName: v.string(),
    quantity: v.number(),
    totalKES: v.number(),
    paymentMethod: v.union(v.literal("cash"), v.literal("mpesa")),
    status: v.union(v.literal("completed"), v.literal("pending"), v.literal("failed")),
    createdAt: v.number(),
    saleGroupId: v.string(),
    /**
     * Paystack charge reference — unused until Phase 8, but added now per
     * this phase's plan so `getByReference` has a real field to query.
     */
    reference: v.optional(v.string()),
  })
    .index("by_shop", ["shopId"])
    .index("by_shop_and_local_id", ["shopId", "localId"])
    .index("by_shop_and_reference", ["shopId", "reference"]),
});
