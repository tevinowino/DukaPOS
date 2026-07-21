"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useLiveQuery } from "dexie-react-hooks";
import { groupTransactionsBySale, listTransactions } from "@/lib/db/transactions";

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, delta: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + delta);
  return next;
}

export default function TransactionsPage() {
  const t = useTranslations("transactions");
  const [date, setDate] = useState(() => startOfDay(new Date()));

  const transactions = useLiveQuery(() => listTransactions({ date }), [date.getTime()]);
  const groups = useMemo(() => groupTransactionsBySale(transactions ?? []), [transactions]);

  return (
    <main className="flex flex-1 flex-col gap-4 p-4">
      <Link href="/" className="text-sm underline">
        {t("backToHome")}
      </Link>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setDate((current) => addDays(current, -1))}
          className="text-sm underline"
        >
          {t("prevDay")}
        </button>
        <p className="text-sm font-medium">
          {date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
        </p>
        <button
          type="button"
          onClick={() => setDate((current) => addDays(current, 1))}
          className="text-sm underline"
        >
          {t("nextDay")}
        </button>
      </div>

      {transactions === undefined ? null : groups.length === 0 ? (
        <p className="flex-1 text-center text-sm text-zinc-500">{t("emptyState")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {groups.map((group) => (
            <li key={group.saleGroupId} className="rounded border p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-zinc-500">
                  {new Date(group.createdAt).toLocaleTimeString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
                <p className="font-semibold">KES {group.totalKES.toLocaleString()}</p>
              </div>
              <ul className="mt-2 flex flex-col gap-1">
                {group.lines.map((line) => (
                  <li key={line.id} className="text-sm text-zinc-700 dark:text-zinc-300">
                    {line.productName} × {line.quantity}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
