"use client";

import { useTranslations } from "next-intl";
import { useLocaleToggle } from "./AppIntlProvider";

/**
 * Switches the app language instantly via `AppIntlProvider`'s client-side
 * state (no network round trip — must work offline per ADR-6). Renders
 * above every `AppLockGate` state so a Swahili-only-literate shopkeeper can
 * reach a readable language before onboarding or the PIN screen, not only
 * after.
 */
export function LocaleToggle() {
  const t = useTranslations("localeToggle");
  const { locale, setLocale } = useLocaleToggle();

  return (
    <div className="flex justify-end gap-1 px-4 py-1 text-xs">
      <button
        type="button"
        onClick={() => setLocale("en")}
        aria-pressed={locale === "en"}
        className={`rounded px-2 py-0.5 ${locale === "en" ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-zinc-500"}`}
      >
        {t("english")}
      </button>
      <button
        type="button"
        onClick={() => setLocale("sw")}
        aria-pressed={locale === "sw"}
        className={`rounded px-2 py-0.5 ${locale === "sw" ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-zinc-500"}`}
      >
        {t("swahili")}
      </button>
    </div>
  );
}
