"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import type { routing } from "@/i18n/routing";
import en from "../../messages/en.json";
import sw from "../../messages/sw.json";

type Locale = (typeof routing.locales)[number];

const MESSAGES: Record<Locale, typeof en> = { en, sw };

const COOKIE_NAME = "NEXT_LOCALE";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

const LocaleToggleContext = createContext<{
  locale: Locale;
  setLocale: (locale: Locale) => void;
} | null>(null);

/**
 * Owns the active locale entirely client-side — both message catalogs are
 * bundled statically and switching is a plain state update — so
 * `LocaleToggle` can change languages instantly with zero network
 * dependency (ADR-6 requires the toggle to keep working while offline).
 *
 * `initialLocale` seeds state from the server-resolved `NEXT_LOCALE` cookie
 * so first paint matches; `setLocale` re-writes that cookie too, but only
 * so the choice survives a full reload or next visit — the cookie never
 * gates in-session rendering, `NextIntlClientProvider`'s `locale`/`messages`
 * props do.
 *
 * KNOWN LIMITATION (see this phase's overview.md): deliberately does *not*
 * call `router.refresh()` after a switch. It was tried, but it made things
 * worse, not better — `[locale]` is a real dynamic route segment under the
 * hood (ADR-6), and refreshing after the cookie changes flips that
 * segment's resolved value, which remounts everything under the root
 * layout (including `AppLockGate`) and force-relocks the app *immediately*,
 * on every toggle. Leaving it unrefreshed means the same remount+relock
 * can still happen, but only if/when the user's next action needs a fresh
 * server round trip (e.g. navigating to an unprefetched route) — strictly
 * better than guaranteeing it on every single toggle.
 */
export function AppIntlProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  function setLocale(nextLocale: Locale) {
    setLocaleState(nextLocale);
    document.cookie = `${COOKIE_NAME}=${nextLocale}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}`;
  }

  return (
    <LocaleToggleContext.Provider value={{ locale, setLocale }}>
      <NextIntlClientProvider
        locale={locale}
        messages={MESSAGES[locale]}
        // DukaPOS is Kenya-only (PRD §2) — a fixed timezone here must
        // match `src/i18n/request.ts`'s server-side config exactly, or
        // date/time formatting (e.g. SyncStatusBar's "last synced at")
        // would mismatch between server-rendered and client-rendered
        // output depending on which timezone the hosting machine runs in.
        timeZone="Africa/Nairobi"
      >
        {children}
      </NextIntlClientProvider>
    </LocaleToggleContext.Provider>
  );
}

export function useLocaleToggle() {
  const context = useContext(LocaleToggleContext);
  if (!context) {
    throw new Error("useLocaleToggle must be used within AppIntlProvider");
  }
  return context;
}
