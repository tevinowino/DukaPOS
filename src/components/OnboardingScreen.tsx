"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { normalizePhone } from "@/lib/identity/normalizePhone";
import { createShopProfile } from "@/lib/identity/shopIdentity";
import { PinPad } from "./PinPad";
import { Card } from "./ui/Card";
import { Screen } from "./ui/Screen";
import { buttonStyles } from "./ui/button";

type Step = "details" | "setPin" | "confirmPin";

/**
 * First-launch flow: shop name + phone, then set PIN, then confirm PIN.
 * One component owning all three steps as local state (global-rules §2:
 * no temporal decomposition into separately-callable step functions) —
 * `createShopProfile` is called exactly once, at the end. Every step
 * shares the same light-card-on-dark-chrome look as `LockScreen`, since
 * this is the same "getting into the app" moment for a first-time user.
 */
export function OnboardingScreen({ onComplete }: { onComplete: () => void }) {
  const t = useTranslations("onboarding");
  const [step, setStep] = useState<Step>("details");
  const [shopName, setShopName] = useState("");
  const [phone, setPhone] = useState("");
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [firstPin, setFirstPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleDetailsSubmit(event: FormEvent) {
    event.preventDefault();
    if (!shopName.trim()) {
      setDetailsError(t("shopNameRequired"));
      return;
    }
    if (!normalizePhone(phone).ok) {
      setDetailsError(t("invalidPhone"));
      return;
    }
    setDetailsError(null);
    setStep("setPin");
  }

  function handleFirstPin(pin: string) {
    setPinError(null);
    setFirstPin(pin);
    setStep("confirmPin");
  }

  async function handleConfirmPin(pin: string) {
    if (pin !== firstPin) {
      setPinError(t("pinMismatch"));
      setFirstPin("");
      setStep("setPin");
      return;
    }

    setSubmitting(true);
    const result = await createShopProfile({ shopName: shopName.trim(), phone, pin });
    setSubmitting(false);

    if (!result.ok) {
      // Phone was already validated in the details step, so reaching here
      // means something unexpected — surface it there rather than a dead end.
      setDetailsError(result.reason);
      setStep("details");
      return;
    }

    onComplete();
  }

  if (step === "details") {
    return (
      <Screen size="narrow" className="items-center justify-center">
        <Card variant="light" className="w-full px-6 py-10">
          <h1 className="mb-6 text-center text-2xl font-semibold text-zinc-900">{t("title")}</h1>
          <form onSubmit={handleDetailsSubmit} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-left text-sm font-medium text-zinc-700">
              {t("shopNameLabel")}
              <input
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                className="rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-3 text-base text-zinc-900 outline-none focus:border-green-600 focus:bg-white"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-left text-sm font-medium text-zinc-700">
              {t("phoneLabel")}
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
                className="rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-3 text-base text-zinc-900 outline-none focus:border-green-600 focus:bg-white"
              />
            </label>
            {detailsError && (
              <p role="alert" className="text-sm text-red-600">
                {detailsError}
              </p>
            )}
            <button type="submit" className={buttonStyles("primary", "lg", "mt-2 w-full")}>
              {t("continueButton")}
            </button>
          </form>
        </Card>
      </Screen>
    );
  }

  if (step === "setPin") {
    return (
      <Screen size="narrow" className="items-center justify-center">
        <Card variant="light" className="w-full px-6 py-10 text-center">
          <h1 className="mb-6 text-2xl font-semibold text-zinc-900">{t("setPinTitle")}</h1>
          {pinError && (
            <p role="alert" className="mb-4 text-sm text-red-600">
              {pinError}
            </p>
          )}
          <PinPad onComplete={handleFirstPin} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen size="narrow" className="items-center justify-center">
      <Card variant="light" className="w-full px-6 py-10 text-center">
        <h1 className="mb-6 text-2xl font-semibold text-zinc-900">{t("confirmPinTitle")}</h1>
        <PinPad onComplete={handleConfirmPin} />
        {submitting && <p className="mt-4 text-sm text-zinc-500">{t("saving")}</p>}
      </Card>
    </Screen>
  );
}
