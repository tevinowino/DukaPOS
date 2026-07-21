"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { verifyPin } from "@/lib/identity/shopIdentity";
import { PinPad } from "./PinPad";

export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const t = useTranslations("lock");
  const [error, setError] = useState(false);

  async function handlePin(pin: string) {
    const correct = await verifyPin(pin);
    // PinPad clears its own entered digits after every 4-digit attempt
    // (success or not), so no manual reset is needed here.
    setError(!correct);
    if (correct) {
      onUnlock();
    }
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <PinPad onComplete={handlePin} />
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {t("incorrectPin")}
        </p>
      )}
    </main>
  );
}
