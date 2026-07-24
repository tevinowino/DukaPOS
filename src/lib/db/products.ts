import { db, type Product } from "./schema";
import { enqueue } from "../sync/queue";

/**
 * Persists a new product, assigning its `id`. Does not enforce barcode
 * uniqueness — two products may share a barcode (Phase 3 owns any
 * duplicate-detection UX at the scan flow; this function just stores what
 * it's given).
 */
export async function addProduct(input: Omit<Product, "id">): Promise<Product> {
  const product: Product = { id: crypto.randomUUID(), ...input };
  await db.products.add(product);
  await enqueue({ type: "product", payload: product });
  return product;
}

/**
 * Applies a partial update to an existing product by id. Fields not present
 * in `changes` are left untouched.
 */
export async function updateProduct(
  id: string,
  changes: Partial<Omit<Product, "id">>,
): Promise<void> {
  await db.products.update(id, changes);
  const updated = await db.products.get(id);
  if (updated) {
    await enqueue({ type: "product", payload: updated });
  }
}

/**
 * Removes a product locally. Existing `Transaction` rows keep their own
 * snapshot of product info and are unaffected.
 *
 * Deletion does not propagate to Convex in this phase — there is no
 * delete-sync entry type or Convex delete mutation yet (out of Phase 5's
 * scope; see its overview.md "Known Debt"). A product removed on-device
 * stays in the synced backend copy.
 */
export async function deleteProduct(id: string): Promise<void> {
  await db.products.delete(id);
}

/** Returns every product. `[]` on an empty database, never `undefined`. */
export async function listProducts(): Promise<Product[]> {
  return db.products.toArray();
}

/** Returns a single product by id, or `undefined` if it doesn't exist. */
export async function getProduct(id: string): Promise<Product | undefined> {
  return db.products.get(id);
}

/**
 * Looks up a product by its barcode. Used by the scan flow to detect
 * "this barcode is already saved — edit it?" rather than creating a
 * duplicate. Returns `undefined` if no product has this barcode.
 */
export async function getProductByBarcode(barcode: string): Promise<Product | undefined> {
  return db.products.where("barcode").equals(barcode).first();
}

/**
 * Adjusts a product's `stockQty` by a signed delta (positive to increase,
 * negative to decrease), clamped at zero — never negative. The single
 * place any stock-quantity math happens; both a cash sale's deduction
 * (`transactions.ts`'s `deductStock`) and a natural-language stock update
 * (Phase 7's stock-update page) call this rather than each computing the
 * clamp themselves. Goes through `updateProduct` so the change is
 * enqueued for sync like any other product edit. Throws if the product no
 * longer exists — callers that need to handle that gracefully (e.g. a
 * batch where one line's product was deleted mid-flow) catch it per line.
 */
export async function applyStockDelta(productId: string, delta: number): Promise<void> {
  const product = await db.products.get(productId);
  if (!product) {
    throw new Error(`Product ${productId} no longer exists`);
  }
  await updateProduct(productId, { stockQty: Math.max(0, product.stockQty + delta) });
}

/** `available` is `undefined` for every product saved before this field existed — treat that the same as `true`. */
export function isAvailable(product: Product): boolean {
  return product.available !== false;
}

/**
 * Normalizes a name to whitespace-separated lowercase tokens — the shared
 * comparison unit both matching functions below build on, so "Red Bull
 * 250ml" and "red bull" agree on what a "token" is.
 */
function nameTokens(name: string): string[] {
  return name.toLowerCase().trim().split(/\s+/).filter(Boolean);
}

/**
 * Finds the best match in `products` for a Gemma photo guess's name, so the
 * scan-to-sell flow can add an *existing* stocked item to the tally instead
 * of always creating a new one. Exact (case-insensitive) name match wins;
 * otherwise the candidate sharing the most whole word-tokens with the guess
 * (at least one) wins, ties broken by name for determinism. Returns
 * `undefined` below that bar — the caller then falls back to quick-add
 * rather than guessing wrong.
 */
export function matchProductByName(guessName: string, products: Product[]): Product | undefined {
  const guessTokens = new Set(nameTokens(guessName));
  if (guessTokens.size === 0) {
    return undefined;
  }

  const exact = products.find((p) => p.name.trim().toLowerCase() === guessName.trim().toLowerCase());
  if (exact) {
    return exact;
  }

  let best: Product | undefined;
  let bestScore = 0;
  for (const product of products) {
    const score = nameTokens(product.name).filter((token) => guessTokens.has(token)).length;
    if (score > bestScore || (score === bestScore && score > 0 && best && product.name < best.name)) {
      best = product;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : undefined;
}

export type StockStatus = "good" | "low" | "out";

/** A product is "low" once its stock drops to this many units or fewer (but isn't yet 0). */
export const LOW_STOCK_THRESHOLD = 5;

/**
 * Classifies a product's stock level — the single place this threshold is
 * defined, since both the Sales dashboard's stock-health counts and the
 * Inventory list's "Low Stock"/"Out of Stock" filters need to agree on
 * exactly the same good/low/out boundaries.
 */
export function getStockStatus(stockQty: number): StockStatus {
  if (stockQty <= 0) {
    return "out";
  }
  if (stockQty <= LOW_STOCK_THRESHOLD) {
    return "low";
  }
  return "good";
}
