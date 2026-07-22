"use client";

import { useEffect, useState } from "react";
import { getShopProfile } from "@/lib/identity/shopIdentity";
import { useOnlineSync } from "@/lib/sync/useOnlineSync";
import { LocaleToggle } from "./LocaleToggle";
import { LockScreen } from "./LockScreen";
import { OfflineIndicator } from "./OfflineIndicator";
import { OnboardingScreen } from "./OnboardingScreen";
import { SyncStatusBar } from "./SyncStatusBar";

type GateStatus = "loading" | "needsOnboarding" | "locked" | "unlocked";

/**
 * Gates every route behind onboarding-then-PIN (ADR-2: a local device app
 * lock, no server session). "Unlocked" is in-memory only — a full reload
 * re-checks and re-locks, which is the intended app-lock semantics.
 *
 * Renders onboarding/lock UI directly rather than redirecting to the
 * `/onboarding` and `/lock` routes — those routes exist for direct
 * navigability, but this component is the actual enforcement mechanism and
 * works the same regardless of which URL was requested.
 *
 * `LocaleToggle` renders unconditionally, above every gate state — a
 * shopkeeper who reads Swahili, not English, needs to be able to switch
 * languages *before* they can get through onboarding or the PIN screen,
 * not only after.
 *
 * `useOnlineSync` is called exactly once here and passed down to
 * `OfflineIndicator`/`SyncStatusBar` as props, rather than each calling it
 * independently: `drainQueue`'s module-level `currentlySyncing` lock only
 * prevents a duplicate *network* call, not duplicate *local* React state —
 * two independent hook instances both firing `syncNow()` on mount (e.g.
 * after this component remounts on a reconnect-triggered reload) race for
 * that lock, and the loser's own `status` state gets stuck on "syncing"
 * forever, since `syncNow` treats "already-in-progress" as "leave status
 * alone." A shared instance means there's only ever one `status` to race.
 */
export function AppLockGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<GateStatus>("loading");
  const onlineSync = useOnlineSync();

  useEffect(() => {
    let cancelled = false;
    getShopProfile().then((profile) => {
      if (cancelled) {
        return;
      }
      setStatus(profile ? "locked" : "needsOnboarding");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <LocaleToggle />
      {status === "needsOnboarding" && (
        <OnboardingScreen onComplete={() => setStatus("unlocked")} />
      )}
      {status === "locked" && <LockScreen onUnlock={() => setStatus("unlocked")} />}
      {status === "unlocked" && (
        <>
          <OfflineIndicator status={onlineSync.status} />
          <SyncStatusBar
            status={onlineSync.status}
            lastSyncedAt={onlineSync.lastSyncedAt}
            syncNow={onlineSync.syncNow}
          />
          {children}
        </>
      )}
    </>
  );
}
