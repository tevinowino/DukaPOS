"use client";

import { useEffect, useState } from "react";
import { getShopProfile } from "@/lib/identity/shopIdentity";
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
 */
export function AppLockGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<GateStatus>("loading");

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
          <OfflineIndicator />
          <SyncStatusBar />
          {children}
        </>
      )}
    </>
  );
}
