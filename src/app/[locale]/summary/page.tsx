"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { listTransactions } from "@/lib/db/transactions";

type Status = "idle" | "loading" | "error";

export default function SummaryPage() {
  const t = useTranslations("summary");
  const locale = useLocale();
  const [status, setStatus] = useState<Status>("idle");
  const [summary, setSummary] = useState<string | null>(null);

  async function handleGenerate() {
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
    <main className="flex flex-1 flex-col gap-4 p-4">
      <Link href="/" className="text-sm underline">
        {t("backToHome")}
      </Link>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      <button
        type="button"
        onClick={handleGenerate}
        disabled={status === "loading"}
        className="w-full max-w-sm rounded bg-zinc-900 py-3 text-base font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {status === "loading"
          ? t("generating")
          : summary
            ? t("regenerateButton")
            : t("generateButton")}
      </button>

      {status === "error" && (
        <p role="alert" className="text-sm text-red-600">
          {t("errorMessage")}
        </p>
      )}

      {summary && <p className="max-w-sm rounded border p-3 text-sm leading-relaxed">{summary}</p>}
    </main>
  );
}
