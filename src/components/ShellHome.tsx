"use client";

import Link from "next/link";
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
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">{t("appName")}</h1>
      <p className="text-base text-zinc-600 dark:text-zinc-400">{t("tagline")}</p>
      <div className="mt-4 flex w-full max-w-sm flex-col gap-3">
        <Link
          href="/sell"
          className="rounded bg-zinc-900 px-6 py-3 text-base font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          {t("newSaleButton")}
        </Link>
        <Link href="/products" className="rounded border px-6 py-3 text-base font-medium">
          {t("viewStockButton")}
        </Link>
        <Link href="/transactions" className="rounded border px-6 py-3 text-base font-medium">
          {t("viewSalesButton")}
        </Link>
      </div>
    </main>
  );
}
