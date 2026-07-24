"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { getShopProfile, verifyPin } from "@/lib/identity/shopIdentity";
import { PinPad } from "./PinPad";
import { Card } from "./ui/Card";
import { Screen } from "./ui/Screen";

export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const t = useTranslations("lock");
  const [error, setError] = useState(false);
  const [context, setContext] = useState<{ shopName: string; phoneE164: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getShopProfile().then((profile) => {
      if (!cancelled && profile) {
        setContext({ shopName: profile.shopName, phoneE164: profile.phoneE164 });
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
    <Screen size="narrow" className="items-center justify-center">
      <Card variant="light" className="w-full px-6 py-10">
        <div className="mb-6 flex flex-col items-center gap-1 text-center">
          <h1 className="text-2xl font-semibold text-zinc-900">{t("title")}</h1>
          {context && (
            <p className="text-sm text-zinc-500">
              {context.shopName} · {context.phoneE164}
            </p>
          )}
        </div>
        <PinPad onComplete={handlePin} />
        {error && (
          <p role="alert" className="mt-4 text-center text-sm text-red-600">
            {t("incorrectPin")}
          </p>
        )}
      </Card>
    </Screen>
  );
}
