"use client";

import { useEffect, useState } from "react";
import { getShopProfile } from "@/lib/identity/shopIdentity";
import { LockScreen } from "./LockScreen";
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

  if (status === "loading") {
    return null;
  }
  if (status === "needsOnboarding") {
    return <OnboardingScreen onComplete={() => setStatus("unlocked")} />;
  }
  if (status === "locked") {
    return <LockScreen onUnlock={() => setStatus("unlocked")} />;
  }
  return (
    <>
      <SyncStatusBar />
      {children}
    </>
  );
}
