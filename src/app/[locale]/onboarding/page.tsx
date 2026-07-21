"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * `AppLockGate` (mounted in the root layout) already renders onboarding
 * in place for *any* path while no shop profile exists, and renders real
 * app content for any path once unlocked. A literal `/onboarding` page
 * that also rendered `<OnboardingScreen>` would be reachable while
 * already unlocked (e.g. a stale bookmark) and could create a second,
 * conflicting shop profile — so this route just funnels back to the one
 * enforcement point instead of duplicating it.
 */
export default function OnboardingPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/");
  }, [router]);
  return null;
}
