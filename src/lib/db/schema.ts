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
 *
 * OVERRIDE (Phase 4, ARCHITECTURE.md §4.5's `Transaction` shape didn't
 * anticipate multi-item sales explicitly, but PRD §5 says "select
 * item(s)"): one row per product line, not per sale. `saleGroupId` shares
 * a value across every line of the same sale so the daily log can group
 * them; `productName` snapshots the product's name at sale time so
 * deleting the product later doesn't break history (see Phase 3's edge
 * case on deletion).
 */
export interface Transaction {
  id: string;
  productId: string;
  /** Snapshot at sale time — survives the product itself being deleted. */
  productName: string;
  quantity: number;
  /** Whole Kenyan Shillings — integer. */
  totalKES: number;
  paymentMethod: "cash" | "mpesa";
  status: "completed" | "pending" | "failed";
  /** Epoch milliseconds. */
  createdAt: number;
  /** Groups every line of one multi-item sale together. */
  saleGroupId: string;
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

/**
 * The single row describing this device's shop (ADR-2: a local device app
 * lock, not a server account). `shopId` is generated once, in
 * `createShopProfile` (`src/lib/identity/shopIdentity.ts`), and is the
 * tenant key every synced record will carry from Phase 5 onward.
 */
export interface ShopProfile {
  shopId: string;
  shopName: string;
  /** Canonical E.164 form, e.g. "+254712345678" — see normalizePhone. */
  phoneE164: string;
  pinHash: string;
  pinSalt: string;
  createdAt: number;
}

class DukaDB extends Dexie {
  products!: EntityTable<Product, "id">;
  transactions!: EntityTable<Transaction, "id">;
  syncQueue!: EntityTable<SyncQueueEntry, "id">;
  shopProfile!: EntityTable<ShopProfile, "shopId">;

  constructor() {
    super("DukaDB");
    this.version(1).stores({
      products: "id, barcode, category",
      transactions: "id, productId, status, createdAt",
      syncQueue: "id, syncedAt",
    });
    // Added in Phase 2. Do not edit the version(1) block above — Dexie
    // migrates existing installs forward by chaining version blocks.
    this.version(2).stores({
      shopProfile: "shopId",
    });
    // Added in Phase 4: indexes `saleGroupId` for the transactions log's
    // per-sale grouping. `productName` needs no index (never queried by).
    this.version(3).stores({
      transactions: "id, productId, status, createdAt, saleGroupId",
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
