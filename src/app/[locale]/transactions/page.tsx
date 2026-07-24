"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronLeft, ChevronRight, Receipt } from "lucide-react";
import { getPaymentBreakdown, groupTransactionsBySale, listTransactions } from "@/lib/db/transactions";
import { PaymentBreakdownCard } from "@/components/PaymentBreakdownCard";
import { Card } from "@/components/ui/Card";
import { Screen } from "@/components/ui/Screen";

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
  const breakdown = useMemo(() => getPaymentBreakdown(transactions ?? []), [transactions]);

  return (
    <Screen size="narrow">
      <Link href="/" className="text-sm text-zinc-400 underline underline-offset-2">
        {t("backToHome")}
      </Link>
      <h1 className="text-2xl font-semibold text-white">{t("title")}</h1>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setDate((current) => addDays(current, -1))}
          className="flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200"
        >
          <ChevronLeft size={16} />
          {t("prevDay")}
        </button>
        <p className="text-sm font-medium text-zinc-300">
          {date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
        </p>
        <button
          type="button"
          onClick={() => setDate((current) => addDays(current, 1))}
          className="flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200"
        >
          {t("nextDay")}
          <ChevronRight size={16} />
        </button>
      </div>

      {transactions !== undefined && transactions.length > 0 && (
        <PaymentBreakdownCard breakdown={breakdown} />
      )}

      {transactions === undefined ? null : groups.length === 0 ? (
        <p className="flex-1 py-8 text-center text-sm text-zinc-500">{t("emptyState")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {groups.map((group) => (
            <li key={group.saleGroupId}>
              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm text-zinc-500">
                    <Receipt size={14} />
                    {new Date(group.createdAt).toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <p className="font-semibold text-white">KES {group.totalKES.toLocaleString()}</p>
                </div>
                <ul className="mt-2 flex flex-col gap-1">
                  {group.lines.map((line) => (
                    <li key={line.id} className="text-sm text-zinc-400">
                      {line.productName} × {line.quantity}
                    </li>
                  ))}
                </ul>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </Screen>
  );
}
