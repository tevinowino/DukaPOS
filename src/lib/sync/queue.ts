import { db, type SyncQueueEntry } from "../db/schema";
import { getShopProfile } from "../identity/shopIdentity";

export interface EnqueueInput {
  type: string;
  payload: unknown;
}

/**
 * Caps how many `SyncQueueEntry` rows go into one `/api/sync` POST body —
 * keeps a single request bounded even after a shop was offline all day and
 * accumulated hundreds of entries. Chosen as a round number comfortably
 * under any reasonable request-body size limit for this payload shape
 * (small JSON objects — products/transactions, not images).
 */
const SYNC_BATCH_SIZE = 50;

/** Queues a local write for later sync to Convex. Called at the single point each write function already touches Dexie — see Phase 3/4's `addProduct`/`updateProduct`/`recordCashSale`. */
export async function enqueue(input: EnqueueInput): Promise<void> {
  const entry: SyncQueueEntry = {
    id: crypto.randomUUID(),
    type: input.type,
    payload: input.payload,
    createdAt: Date.now(),
  };
  await db.syncQueue.add(entry);
}

interface SyncApiResultEntry {
  id: string;
  status: "synced" | "skipped";
}

interface SyncApiResponseBody {
  results: SyncApiResultEntry[];
}

export type DrainOutcome = "synced" | "nothing-to-sync" | "failed" | "already-in-progress";

/** In-memory only — resets on reload, which is fine: a fresh drain naturally re-reads whatever's still unsynced. */
let currentlySyncing = false;

/**
 * Drains every unsynced `SyncQueue` entry to `/api/sync`, in bounded
 * batches. Guarded against overlapping calls — rapid online/offline
 * flapping must not fire two drains concurrently over the same entries,
 * which could double-send a batch mid-flight.
 */
export async function drainQueue(): Promise<DrainOutcome> {
  if (currentlySyncing) {
    return "already-in-progress";
  }
  currentlySyncing = true;

  try {
    const allEntries = await db.syncQueue.toArray();
    const pending = allEntries.filter((entry) => entry.syncedAt === undefined);
    if (pending.length === 0) {
      return "nothing-to-sync";
    }

    const shopProfile = await getShopProfile();
    if (!shopProfile) {
      // Nothing to scope the sync to yet (onboarding hasn't run) — leave
      // entries queued rather than sending an unscoped request.
      return "failed";
    }

    for (let i = 0; i < pending.length; i += SYNC_BATCH_SIZE) {
      const batch = pending.slice(i, i + SYNC_BATCH_SIZE);

      let response: Response;
      try {
        response = await fetch("/api/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shopId: shopProfile.shopId,
            entries: batch.map((entry) => ({ id: entry.id, type: entry.type, payload: entry.payload })),
          }),
        });
      } catch {
        return "failed";
      }

      if (!response.ok) {
        return "failed";
      }

      const body: SyncApiResponseBody = await response.json();
      const syncedIds = new Set(
        body.results.filter((result) => result.status === "synced").map((result) => result.id),
      );
      const syncedAt = Date.now();
      await Promise.all(
        batch
          .filter((entry) => syncedIds.has(entry.id))
          .map((entry) => db.syncQueue.update(entry.id, { syncedAt })),
      );
    }

    return "synced";
  } finally {
    currentlySyncing = false;
  }
}
