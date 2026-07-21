import Dexie, { type EntityTable } from "dexie";

/**
 * A single inventory item. Sourced from a barcode scan, an AI photo guess
 * (confirmed/edited by the shopkeeper), or manual entry — `source` records
 * which, but every Product is treated identically once saved.
 *
 * Single-shop-per-device (ADR-2): no `shopId` field here. The one `shopId`
 * for this device lives in the `shopProfile` table (Phase 2).
 */
export interface Product {
  id: string;
  name: string;
  category: string;
  /** Optional: unbarcoded/loose goods have no value here. */
  barcode?: string;
  /** Whole Kenyan Shillings — integer, never a fraction or subunit. */
  priceKES: number;
  /** Integer, never negative. */
  stockQty: number;
  source: "barcode" | "photo" | "manual";
}

/**
 * One product line of a sale. `status` starts at `'completed'` for cash
 * sales (settled instantly) or `'pending'` for M-Pesa sales awaiting the
 * Paystack webhook (Phase 8).
 */
export interface Transaction {
  id: string;
  productId: string;
  quantity: number;
  /** Whole Kenyan Shillings — integer. */
  totalKES: number;
  paymentMethod: "cash" | "mpesa";
  status: "completed" | "pending" | "failed";
  /** Epoch milliseconds. */
  createdAt: number;
}

/**
 * A local-only record of a write made while offline (or made at all, prior
 * to sync), awaiting `/api/sync` to drain it to Convex (Phase 5). `type`
 * and `payload` are intentionally loose here — Phase 5 owns the queue
 * engine and the exact payload shapes it drains.
 */
export interface SyncQueueEntry {
  id: string;
  type: string;
  payload: unknown;
  createdAt: number;
  syncedAt?: number;
}

class DukaDB extends Dexie {
  products!: EntityTable<Product, "id">;
  transactions!: EntityTable<Transaction, "id">;
  syncQueue!: EntityTable<SyncQueueEntry, "id">;

  constructor() {
    super("DukaDB");
    this.version(1).stores({
      products: "id, barcode, category",
      transactions: "id, productId, status, createdAt",
      syncQueue: "id, syncedAt",
    });
  }
}

/**
 * Module-level singleton — never construct `DukaDB` anywhere else. Dexie
 * itself handles concurrent opens safely, but a single shared instance
 * keeps `useLiveQuery` subscriptions and writes talking to the same
 * connection across hot reloads.
 */
export const db = new DukaDB();
