"use client";

import { useTranslations } from "next-intl";

/**
 * A client component so it's testable by wrapping it directly in
 * `NextIntlClientProvider` (see ShellHome.test.tsx) — the alternative,
 * testing `[locale]/page.tsx` itself, isn't practical since Server
 * Component `useTranslations`/`getMessages` depend on Next.js's
 * request-scoped context, which doesn't exist outside real request
 * handling.
 */
export function ShellHome() {
  const t = useTranslations("shell");
  

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">{t("appName")}</h1>
      <p className="text-base text-zinc-600 dark:text-zinc-400">{t("tagline")}</p>
    </main>
  );
}
