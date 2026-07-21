"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { normalizePhone } from "@/lib/identity/normalizePhone";
import { createShopProfile } from "@/lib/identity/shopIdentity";
import { PinPad } from "./PinPad";

type Step = "details" | "setPin" | "confirmPin";

/**
 * First-launch flow: shop name + phone, then set PIN, then confirm PIN.
 * One component owning all three steps as local state (global-rules §2:
 * no temporal decomposition into separately-callable step functions) —
 * `createShopProfile` is called exactly once, at the end.
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
      <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <form
          onSubmit={handleDetailsSubmit}
          className="flex w-full max-w-sm flex-col gap-3"
        >
          <label className="flex flex-col gap-1 text-left text-sm">
            {t("shopNameLabel")}
            <input
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              className="rounded border px-3 py-2 text-base"
            />
          </label>
          <label className="flex flex-col gap-1 text-left text-sm">
            {t("phoneLabel")}
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              className="rounded border px-3 py-2 text-base"
            />
          </label>
          {detailsError && (
            <p role="alert" className="text-sm text-red-600">
              {detailsError}
            </p>
          )}
          <button
            type="submit"
            className="rounded bg-zinc-900 py-2 text-base font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            {t("continueButton")}
          </button>
        </form>
      </main>
    );
  }

  if (step === "setPin") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
        <h1 className="text-2xl font-semibold">{t("setPinTitle")}</h1>
        {pinError && (
          <p role="alert" className="text-sm text-red-600">
            {pinError}
          </p>
        )}
        <PinPad onComplete={handleFirstPin} />
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-2xl font-semibold">{t("confirmPinTitle")}</h1>
      <PinPad onComplete={handleConfirmPin} />
      {submitting && <p className="text-sm text-zinc-500">{t("saving")}</p>}
    </main>
  );
}
