"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useLiveQuery } from "dexie-react-hooks";
import { TrendingUp, TrendingDown, Award } from "lucide-react";
import { getRecentDailyRevenue, getTopMover, listTransactions } from "@/lib/db/transactions";
import { useOnlineSync } from "@/lib/sync/useOnlineSync";
import { Card } from "@/components/ui/Card";
import { Screen } from "@/components/ui/Screen";
import { buttonStyles } from "@/components/ui/button";
import { BottomNav } from "@/components/ui/BottomNav";

type Status = "idle" | "loading" | "error" | "offline";

export default function SummaryPage() {
  const t = useTranslations("summary");
  const locale = useLocale();
  const { status: syncStatus } = useOnlineSync();
  const isOnline = syncStatus !== "offline";
  const [status, setStatus] = useState<Status>("idle");
  const [summary, setSummary] = useState<string | null>(null);

  const todaysTransactions = useLiveQuery(() => listTransactions(), []) ?? [];
  const recentRevenue = useLiveQuery(() => getRecentDailyRevenue(2), []) ?? [];

  const totalToday = todaysTransactions.reduce((sum, tx) => sum + tx.totalKES, 0);
  const totalYesterday = recentRevenue[0]?.totalKES ?? 0;
  const percentChange =
    totalYesterday > 0 ? Math.round(((totalToday - totalYesterday) / totalYesterday) * 100) : null;
  const topMover = getTopMover(todaysTransactions);

  async function handleGenerate() {
    if (!isOnline) {
      setStatus("offline");
      return;
    }

    setStatus("loading");
    setSummary(null);

    try {
      const transactions = await listTransactions();
      const response = await fetch("/api/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactions, locale }),
      });
      if (!response.ok) {
        throw new Error("summary failed");
      }
      const body = (await response.json()) as { summary: string };
      setSummary(body.summary);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }

  return (
    <>
      <Screen size="wide" padBottomNav>
        <Link href="/" className="text-sm text-zinc-400 underline underline-offset-2">
          {t("backToHome")}
        </Link>
        <h1 className="text-2xl font-semibold text-white">{t("title")}</h1>

        <div className="grid grid-cols-2 gap-3">
          <Card className="p-4">
            <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">
              {t("totalSales")}
            </p>
            <p className="mt-1 text-2xl font-bold text-white">KSh {totalToday.toLocaleString()}</p>
            {percentChange !== null && (
              <p
                className={`mt-1 flex items-center gap-1 text-xs font-medium ${
                  percentChange >= 0 ? "text-green-500" : "text-red-400"
                }`}
              >
                {percentChange >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {t("vsYesterday", { percent: `${percentChange >= 0 ? "+" : ""}${percentChange}%` })}
              </p>
            )}
          </Card>
          <Card className="p-4">
            <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">
              {t("topMover")}
            </p>
            {topMover ? (
              <>
                <p className="mt-1 flex items-center gap-1.5 text-base font-semibold text-white">
                  <Award size={16} className="text-green-500" />
                  {topMover.productName}
                </p>
                <p className="mt-1 text-xs text-zinc-500">{t("unitsSold", { count: topMover.quantity })}</p>
              </>
            ) : (
              <p className="mt-1 text-sm text-zinc-500">{t("noSalesYet")}</p>
            )}
          </Card>
        </div>

        <button
          type="button"
          onClick={handleGenerate}
          disabled={status === "loading"}
          className={buttonStyles("primary", "lg", "w-full")}
        >
          {status === "loading"
            ? t("generating")
            : summary
              ? t("regenerateButton")
              : t("generateButton")}
        </button>

        {status === "error" && (
          <p role="alert" className="text-sm text-red-400">
            {t("errorMessage")}
          </p>
        )}

        {status === "offline" && (
          <p role="alert" className="text-sm text-amber-400">
            {t("offlineMessage")}
          </p>
        )}

        {summary && (
          <Card className="p-4 text-sm leading-relaxed text-zinc-200">{summary}</Card>
        )}
      </Screen>
      <BottomNav />
    </>
  );
}
