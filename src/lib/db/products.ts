import { db, type Product } from "./schema";

/**
 * Persists a new product, assigning its `id`. Does not enforce barcode
 * uniqueness — two products may share a barcode (Phase 3 owns any
 * duplicate-detection UX at the scan flow; this function just stores what
 * it's given).
 */
export async function addProduct(input: Omit<Product, "id">): Promise<Product> {
  const product: Product = { id: crypto.randomUUID(), ...input };
  await db.products.add(product);
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
}

/** Removes a product. Existing `Transaction` rows keep their own snapshot of product info and are unaffected. */
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
