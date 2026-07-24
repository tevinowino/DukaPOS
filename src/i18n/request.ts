import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    // DukaPOS is Kenya-only (PRD §2) — a fixed timezone, not the server's
    // local one, keeps date/time formatting (e.g. SyncStatusBar's "last
    // synced at", the transactions log's day header) identical between
    // server-rendered and client-rendered output regardless of which
    // timezone the hosting machine happens to run in.
    timeZone: "Africa/Nairobi",
  };
});
