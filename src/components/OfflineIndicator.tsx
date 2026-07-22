"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useOnlineSync } from "@/lib/sync/useOnlineSync";

/** Absorbs rapid online/offline flapping on an unstable connection so the badge doesn't flicker distractingly. */
const DEBOUNCE_MS = 1_500;

/**
 * A small, persistent "you're offline" badge, visible app-wide. Reuses
 * Phase 5's `useOnlineSync` for detection (global-rules DRY) rather than
 * a second listener — `SyncStatusBar` already surfaces detailed sync
 * state including an offline message; this is a plainer, higher-contrast
 * signal specifically for "can I trust the network right now," useful on
 * screens (like the photo/AI flows) that need a blunt yes/no answer.
 */
export function OfflineIndicator() {
  const t = useTranslations("offlineIndicator");
  const { status } = useOnlineSync();
  const [debouncedOffline, setDebouncedOffline] = useState(status === "offline");

  useEffect(() => {
    const timeoutId = setTimeout(() => setDebouncedOffline(status === "offline"), DEBOUNCE_MS);
    return () => clearTimeout(timeoutId);
  }, [status]);

  if (!debouncedOffline) {
    return null;
  }

  return (
    <div
      role="status"
      className="bg-amber-100 px-4 py-1 text-center text-xs font-medium text-amber-900 dark:bg-amber-900 dark:text-amber-100"
    >
      {t("offlineBadge")}
    </div>
  );
}
