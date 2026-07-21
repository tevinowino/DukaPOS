"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * See `onboarding/page.tsx` for why this redirects rather than rendering
 * its own `<LockScreen>` — `AppLockGate` in the root layout is the single
 * enforcement point and already covers this path.
 */
export default function LockPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/");
  }, [router]);
  return null;
}
