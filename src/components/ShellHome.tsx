"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowRight, Plus, Receipt, Mic, BarChart3, Store } from "lucide-react";
import { listProducts, getStockStatus } from "@/lib/db/products";
import { getRecentDailyRevenue, groupTransactionsBySale, listTransactions } from "@/lib/db/transactions";
import { Card } from "./ui/Card";
import { Screen } from "./ui/Screen";
import { BottomNav } from "./ui/BottomNav";

const CHART_DAYS = 7;
const RECENT_SALES_SHOWN = 3;

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

  const products = useLiveQuery(() => listProducts(), []) ?? [];
  const todaysTransactions = useLiveQuery(() => listTransactions(), []) ?? [];
  const dailyRevenue = useLiveQuery(() => getRecentDailyRevenue(CHART_DAYS), []) ?? [];

  const totalRevenue = todaysTransactions.reduce((sum, t) => sum + t.totalKES, 0);
  const maxDailyRevenue = Math.max(1, ...dailyRevenue.map((d) => d.totalKES));

  const stockCounts = products.reduce(
    (counts, product) => {
      counts[getStockStatus(product.stockQty)] += 1;
      return counts;
    },
    { good: 0, low: 0, out: 0 },
  );

  const recentSales = groupTransactionsBySale(todaysTransactions).slice(0, RECENT_SALES_SHOWN);

  return (
    <>
      <Screen size="wide" padBottomNav>
        {/* No "DukaPOS" wordmark repeated here — AppHeader (rendered by
            AppLockGate, above this component in the real app) already
            shows it on every screen. Duplicating the literal text would
            make `getByText("DukaPOS")` — used throughout this project's
            E2E suite as the "onboarding/unlock completed" check — resolve
            to two elements and fail Playwright's strict mode. */}
        <p className="text-sm text-zinc-400">{t("tagline")}</p>

        <Card className="p-5">
          <p className="text-sm font-medium text-zinc-300">{t("todaysSales")}</p>
          <p className="mt-2 text-xs font-medium tracking-wide text-zinc-500 uppercase">
            {t("totalRevenue")}
          </p>
          <p className="text-3xl font-bold text-white">
            KSh {totalRevenue.toLocaleString()}
          </p>
          <div className="mt-4 flex h-16 items-end gap-1.5">
            {dailyRevenue.map((day, i) => (
              <div
                key={i}
                className="flex-1 rounded-t-sm bg-green-600/70"
                style={{ height: `${Math.max(6, (day.totalKES / maxDailyRevenue) * 100)}%` }}
              />
            ))}
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/sell"
            className="flex flex-col gap-3 rounded-2xl bg-green-600 p-4 text-white transition-colors hover:bg-green-500"
          >
            <Store size={20} />
            <span className="flex items-center gap-1 text-sm font-medium">
              {t("newSaleButton")}
              <ArrowRight size={14} />
            </span>
          </Link>
          <Link
            href="/products"
            className="flex flex-col gap-3 rounded-2xl border border-zinc-700 p-4 text-zinc-100 transition-colors hover:bg-zinc-900"
          >
            <Plus size={20} />
            <span className="text-sm font-medium">{t("viewStockButton")}</span>
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/stock-update"
            className="flex items-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-900"
          >
            <Mic size={16} className="text-green-500" />
            {t("stockUpdateButton")}
          </Link>
          <Link
            href="/summary"
            className="flex items-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-900"
          >
            <BarChart3 size={16} className="text-green-500" />
            {t("summaryButton")}
          </Link>
        </div>

        <Card className="p-5">
          <p className="mb-3 text-sm font-medium text-zinc-300">{t("stockHealth")}</p>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="flex flex-col items-center gap-1.5">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/15 text-lg font-semibold text-green-500">
                {stockCounts.good}
              </span>
              <span className="text-xs text-zinc-500">{t("stockGood")}</span>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/15 text-lg font-semibold text-amber-500">
                {stockCounts.low}
              </span>
              <span className="text-xs text-zinc-500">{t("stockLow")}</span>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/15 text-lg font-semibold text-red-500">
                {stockCounts.out}
              </span>
              <span className="text-xs text-zinc-500">{t("stockOut")}</span>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium text-zinc-300">{t("recentActivity")}</p>
            <Link href="/transactions" className="text-xs font-medium text-green-500">
              {t("viewSalesButton")}
            </Link>
          </div>
          {recentSales.length === 0 ? (
            <p className="text-sm text-zinc-500">{t("noSalesToday")}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {recentSales.map((sale) => (
                <li key={sale.saleGroupId} className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-800 text-zinc-400">
                    <Receipt size={16} />
                  </span>
                  <span className="flex-1 truncate text-sm text-zinc-200">
                    {sale.lines.map((line) => line.productName).join(", ")}
                  </span>
                  <span className="text-sm font-medium text-white">
                    KSh {sale.totalKES.toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </Screen>
      <BottomNav />
    </>
  );
}
