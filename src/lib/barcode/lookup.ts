/**
 * The only file that talks to an external barcode database (mirrors
 * `paystackClient.ts`'s "one file owns one external API's wire shapes"
 * rule). Callers only ever see `lookupBarcode` and its normalized result —
 * which provider answered, and how each one's JSON is shaped, stays hidden
 * in here.
 *
 * Chain: Open Food Facts first (free, no key, verified live to have strong
 * coverage of exactly the FMCG/grocery/drink items a Kenyan duka stocks —
 * see this module's tests for the real response shape), then UPCitemdb's
 * free trial endpoint (broader general-merchandise catalog, no signup, but
 * rate-limited — verified live at 100 requests/day) only if Open Food Facts
 * has no match. Both failing (miss, timeout, or network error) resolves to
 * `null` — the caller falls back to asking the shopkeeper to price it
 * manually, never to a thrown error the UI has to specially handle.
 */

export interface BarcodeLookupResult {
  barcode: string;
  name: string;
  category: string;
}

/** Generous enough for a slow mobile-data connection without stalling the scan-to-sell flow for multiple seconds. */
const PROVIDER_TIMEOUT_MS = 5_000;

async function fetchWithTimeout(url: string): Promise<Response | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } catch {
    // Network failure, abort, or the provider being unreachable — all fall through to the next provider.
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

interface OpenFoodFactsResponse {
  status: number;
  product?: {
    product_name?: string;
    brands?: string;
    categories?: string;
  };
}

/**
 * Verified live against a real barcode (see lookup.test.ts): `status: 1`
 * plus a `product` object means found; `status: 0` (no `product` key at
 * all) means not in Open Food Facts' database. `product_name` is
 * frequently lowercase/unstyled as entered by contributors — title-cased
 * here so it reads like the rest of this app's product names.
 */
async function lookupOpenFoodFacts(barcode: string): Promise<BarcodeLookupResult | null> {
  const response = await fetchWithTimeout(
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=product_name,brands,categories`,
  );
  if (!response || !response.ok) {
    return null;
  }

  const body = (await response.json()) as OpenFoodFactsResponse;
  const name = body.product?.product_name?.trim();
  if (body.status !== 1 || !name) {
    return null;
  }

  return {
    barcode,
    name: name.replace(/\b\w/g, (letter) => letter.toUpperCase()),
    category: body.product?.categories?.split(",")[0]?.trim() || body.product?.brands?.split(",")[0]?.trim() || "General",
  };
}

interface UpcItemDbResponse {
  code: string;
  items?: Array<{ title?: string; category?: string; brand?: string }>;
}

/**
 * Verified live (see lookup.test.ts): a match is `code: "OK"` with a
 * non-empty `items` array; anything else (`"INVALID_UPC"`, a non-2xx
 * status, or `code: "OK"` with an empty `items`) is treated uniformly as a
 * miss — this endpoint's exact miss vocabulary isn't documented, so this
 * intentionally doesn't try to distinguish "malformed code" from "no
 * product" (both mean the same thing to this app's caller: fall back).
 */
async function lookupUpcItemDb(barcode: string): Promise<BarcodeLookupResult | null> {
  const response = await fetchWithTimeout(
    `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(barcode)}`,
  );
  if (!response || !response.ok) {
    return null;
  }

  const body = (await response.json()) as UpcItemDbResponse;
  const item = body.code === "OK" ? body.items?.[0] : undefined;
  if (!item?.title) {
    return null;
  }

  return {
    barcode,
    name: item.title,
    category: item.category?.split(">").pop()?.trim() || "General",
  };
}

/** Looks up a barcode against external product databases, trying each provider in order until one has a match. */
export async function lookupBarcode(barcode: string): Promise<BarcodeLookupResult | null> {
  return (await lookupOpenFoodFacts(barcode)) ?? (await lookupUpcItemDb(barcode));
}
