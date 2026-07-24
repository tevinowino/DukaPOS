"use client";

import { useTranslations } from "next-intl";
import { useLocaleToggle } from "./AppIntlProvider";

/**
 * Switches the app language instantly via `AppIntlProvider`'s client-side
 * state (no network round trip — must work offline per ADR-6). Rendered
 * inside `AppHeader`, which itself appears above every `AppLockGate`
 * state, so a Swahili-only-literate shopkeeper can reach a readable
 * language before onboarding or the PIN screen, not only after.
 */
export function LocaleToggle() {
  const t = useTranslations("localeToggle");
  const { locale, setLocale } = useLocaleToggle();

  return (
    <div className="flex items-center gap-0.5 rounded-full border border-zinc-800 bg-zinc-900 p-0.5 text-xs font-medium">
      <button
        type="button"
        onClick={() => setLocale("en")}
        aria-pressed={locale === "en"}
        className={`rounded-full px-2.5 py-1 transition-colors ${
          locale === "en" ? "bg-green-600 text-white" : "text-zinc-400"
        }`}
      >
        {t("english")}
      </button>
      <button
        type="button"
        onClick={() => setLocale("sw")}
        aria-pressed={locale === "sw"}
        className={`rounded-full px-2.5 py-1 transition-colors ${
          locale === "sw" ? "bg-green-600 text-white" : "text-zinc-400"
        }`}
      >
        {t("swahili")}
      </button>
    </div>
  );
}
