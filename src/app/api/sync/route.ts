import { NextResponse } from "next/server";
import { fetchMutation } from "convex/nextjs";
import { api } from "@convex/_generated/api";
import type { Product, Transaction } from "@/lib/db/schema";

interface SyncEntry {
  id: string;
  type: string;
  payload: unknown;
}

interface SyncRequestBody {
  shopId: string;
  entries: SyncEntry[];
}

interface SyncResultEntry {
  id: string;
  status: "synced" | "skipped";
}

/**
 * Translates one queued Dexie write into the matching Convex mutation.
 * Unrecognized entry types are a soft per-entry skip (not marked synced,
 * left for a human/future fix) — genuine Convex failures (deployment
 * unreachable, etc.) are left to throw and are handled by the caller as a
 * whole-request failure, since retrying the whole batch is safe (every
 * Convex mutation here is an idempotent upsert).
 */
async function syncOne(shopId: string, entry: SyncEntry): Promise<SyncResultEntry> {
  if (entry.type === "product") {
    const product = entry.payload as Product;
    await fetchMutation(api.products.upsertProduct, {
      shopId,
      localId: product.id,
      name: product.name,
      category: product.category,
      barcode: product.barcode,
      priceKES: product.priceKES,
      stockQty: product.stockQty,
      source: product.source,
    });
    return { id: entry.id, status: "synced" };
  }

  if (entry.type === "transaction") {
    const transaction = entry.payload as Transaction;
    await fetchMutation(api.transactions.upsertTransaction, {
      shopId,
      localId: transaction.id,
      productId: transaction.productId,
      productName: transaction.productName,
      quantity: transaction.quantity,
      totalKES: transaction.totalKES,
      paymentMethod: transaction.paymentMethod,
      status: transaction.status,
      createdAt: transaction.createdAt,
      saleGroupId: transaction.saleGroupId,
    });
    return { id: entry.id, status: "synced" };
  }

  console.warn(`/api/sync: skipping entry ${entry.id} with unrecognized type "${entry.type}"`);
  return { id: entry.id, status: "skipped" };
}

export async function POST(request: Request) {
  const body = (await request.json()) as SyncRequestBody;

  try {
    const results = await Promise.all(
      body.entries.map((entry) => syncOne(body.shopId, entry)),
    );
    return NextResponse.json({ results });
  } catch (error) {
    console.warn("/api/sync: Convex sync failed", error);
    return NextResponse.json({ error: "Sync failed — will retry" }, { status: 502 });
  }
}
