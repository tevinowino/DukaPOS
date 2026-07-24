"use client";

import { useTranslations } from "next-intl";
import { Banknote, Smartphone } from "lucide-react";
import type { PaymentBreakdown } from "@/lib/db/transactions";
import { Card } from "@/components/ui/Card";

interface PaymentBreakdownCardProps {
  breakdown: PaymentBreakdown;
}

/** How a day's completed sales split between Cash and M-Pesa — presentation only, all the math lives in `getPaymentBreakdown`. */
export function PaymentBreakdownCard({ breakdown }: PaymentBreakdownCardProps) {
  const t = useTranslations("transactions");

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">{t("paymentBreakdownTitle")}</p>
        <p className="text-sm font-semibold text-white">KES {breakdown.totalKES.toLocaleString()}</p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-500/15 text-green-500">
            <Banknote size={16} />
          </span>
          <span>
            <p className="text-sm font-semibold text-white">KES {breakdown.cash.totalKES.toLocaleString()}</p>
            <p className="text-xs text-zinc-500">{t("cashCount", { count: breakdown.cash.count })}</p>
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-500/15 text-green-500">
            <Smartphone size={16} />
          </span>
          <span>
            <p className="text-sm font-semibold text-white">KES {breakdown.mpesa.totalKES.toLocaleString()}</p>
            <p className="text-xs text-zinc-500">{t("mpesaCount", { count: breakdown.mpesa.count })}</p>
          </span>
        </div>
      </div>
    </Card>
  );
}
