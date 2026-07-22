"use client";

import { useTranslations } from "next-intl";
import type { SyncStatus } from "@/lib/sync/useOnlineSync";

/**
 * Always-visible sync status once the app is unlocked — PRD §6's "graceful
 * degradation" needs to be visible, not silent, so a shopkeeper is never
 * left guessing whether their offline changes made it to the cloud.
 *
 * Takes `status`/`lastSyncedAt`/`syncNow` as props rather than calling
 * `useOnlineSync` itself — see `AppLockGate.tsx`'s doc comment for why
 * sharing one hook instance with `OfflineIndicator` matters, not just DRY.
 */
export function SyncStatusBar({
  status,
  lastSyncedAt,
  syncNow,
}: {
  status: SyncStatus;
  lastSyncedAt: number | null;
  syncNow: () => void;
}) {
  const t = useTranslations("sync");

  const label =
    status === "offline"
      ? t("offline")
      : status === "syncing"
        ? t("syncing")
        : status === "failed"
          ? t("failed")
          : status === "synced" && lastSyncedAt !== null
            ? t("lastSynced", {
                time: new Date(lastSyncedAt).toLocaleTimeString(undefined, {
                  hour: "2-digit",
                  minute: "2-digit",
                }),
              })
            : t("idle");

  return (
    <div className="flex items-center justify-between border-b bg-zinc-50 px-4 py-2 text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
      <span>{label}</span>
      <button type="button" onClick={() => syncNow()} className="underline">
        {t("syncNowButton")}
      </button>
    </div>
  );
}
