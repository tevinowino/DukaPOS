import { defineRouting } from "next-intl/routing";

/**
 * ADR-6: the locale never shows in the URL — DukaPOS is a single-shop app
 * with no SEO requirement, so the shopkeeper switches languages with an
 * in-app toggle (Phase 9) rather than navigating to a different URL. A
 * `[locale]` route segment still exists (next-intl requires it), and the
 * active locale is tracked via the `NEXT_LOCALE` cookie that `proxy.ts` sets.
 */
export const routing = defineRouting({
  locales: ["en", "sw"],
  defaultLocale: "en",
  localePrefix: "never",
});
