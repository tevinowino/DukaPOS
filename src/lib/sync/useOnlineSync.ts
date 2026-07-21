"use client";

import { useCallback, useEffect, useState } from "react";
import { drainQueue } from "./queue";

export type SyncStatus = "idle" | "syncing" | "synced" | "failed" | "offline";

export interface UseOnlineSyncResult {
  status: SyncStatus;
  lastSyncedAt: number | null;
  /** Manual "sync now" trigger, for a UI affordance the shopkeeper can tap. */
  syncNow: () => Promise<void>;
}

/**
 * Drains the sync queue on mount (if already online), on every browser
 * `online` event, and on demand via `syncNow`. This is the reconnect
 * listener ARCHITECTURE.md §5.4 calls for — not the (inconsistently
 * supported) Background Sync API.
 */
export function useOnlineSync(): UseOnlineSyncResult {
  const [status, setStatus] = useState<SyncStatus>(() =>
    typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "idle",
  );
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);

  const syncNow = useCallback(async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setStatus("offline");
      return;
    }

    setStatus("syncing");
    const outcome = await drainQueue();

    if (outcome === "synced") {
      setStatus("synced");
      setLastSyncedAt(Date.now());
    } else if (outcome === "nothing-to-sync") {
      setStatus("idle");
    } else if (outcome === "failed") {
      setStatus("failed");
    }
    // "already-in-progress": leave status alone — the in-flight call will settle it.
  }, []);

  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.onLine) {
      // Deferred via a microtask (not called synchronously here) so
      // `syncNow`'s own setState calls never run within this effect's
      // synchronous execution — same reasoning as the lint rule that
      // flags `react-hooks/set-state-in-effect` elsewhere in this codebase.
      void Promise.resolve().then(() => syncNow());
    }

    function handleOnline() {
      syncNow();
    }
    function handleOffline() {
      setStatus("offline");
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [syncNow]);

  return { status, lastSyncedAt, syncNow };
}
