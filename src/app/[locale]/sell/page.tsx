"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Banknote, Minus, Plus, Smartphone, X } from "lucide-react";
import { recordCashSale } from "@/lib/db/transactions";
import type { Product } from "@/lib/db/schema";
import { ScanToSell } from "@/components/ScanToSell";
import { Card } from "@/components/ui/Card";
import { Screen } from "@/components/ui/Screen";
import { buttonStyles } from "@/components/ui/button";

interface SaleLine {
  product: Product;
  quantity: number;
}

type PaymentMethod = "cash" | "mpesa";

export default function SellPage() {
  const t = useTranslations("sell");
  const router = useRouter();
  const [lines, setLines] = useState<SaleLine[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");

  function addLineForProduct(product: Product) {
    setLines((prev) => {
      const existing = prev.find((line) => line.product.id === product.id);
      if (existing) {
        return prev.map((line) =>
          line.product.id === product.id ? { ...line, quantity: line.quantity + 1 } : line,
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  }

  function updateQuantity(productId: string, quantity: number) {
    setLines((prev) =>
      prev.map((line) =>
        line.product.id === productId ? { ...line, quantity: Math.max(1, quantity) } : line,
      ),
    );
  }

  function removeLine(productId: string) {
    setLines((prev) => prev.filter((line) => line.product.id !== productId));
  }

  const total = lines.reduce((sum, line) => sum + line.product.priceKES * line.quantity, 0);
  const hasLines = lines.length > 0;
  // M-Pesa checkout is scoped to a single product line — see
  // plan/phase-08.../overview.md "Design Decisions" for why (Convex's
  // markPending/markCompleted shape is inherently one-transaction-per-
  // reference, unlike cash's multi-item recordCashSale).
  const mpesaEligible = lines.length === 1;
  const canConfirm =
    hasLines &&
    lines.every((line) => line.quantity >= 1) &&
    (paymentMethod === "cash" || mpesaEligible);

  async function handleConfirm() {
    if (!canConfirm) {
      return;
    }
    if (paymentMethod === "mpesa") {
      const [line] = lines;
      router.push(`/checkout/mpesa?productId=${line.product.id}&quantity=${line.quantity}`);
      return;
    }
    await recordCashSale(lines.map((line) => ({ productId: line.product.id, quantity: line.quantity })));
    router.push("/transactions");
  }

  return (
    <Screen size="narrow">
      <Link href="/" className="text-sm text-zinc-400 underline underline-offset-2">
        {t("backToHome")}
      </Link>
      <h1 className="text-2xl font-semibold text-white">{t("title")}</h1>

      <ScanToSell onAddProduct={addLineForProduct} />

      {lines.length > 0 && (
        <Card className="divide-y divide-zinc-800 p-2">
          {lines.map((line) => {
            const overStock = line.quantity > line.product.stockQty;
            return (
              <div key={line.product.id} className="flex items-center justify-between gap-2 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-zinc-100">{line.product.name}</p>
                  <p className="text-xs text-zinc-500">KSh {line.product.priceKES.toLocaleString()}</p>
                  {overStock && (
                    <p className="text-xs text-amber-500">
                      {t("lowStockWarning", { count: line.product.stockQty })}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => updateQuantity(line.product.id, line.quantity - 1)}
                    aria-label={`-1 ${line.product.name}`}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                  >
                    <Minus size={14} />
                  </button>
                  <input
                    type="number"
                    min={1}
                    value={line.quantity}
                    onChange={(e) => updateQuantity(line.product.id, Number(e.target.value))}
                    aria-label={t("quantityLabel", { name: line.product.name })}
                    className="w-12 rounded-lg border border-zinc-800 bg-zinc-900 py-1 text-center text-zinc-100"
                  />
                  <button
                    type="button"
                    onClick={() => updateQuantity(line.product.id, line.quantity + 1)}
                    aria-label={`+1 ${line.product.name}`}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                  >
                    <Plus size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeLine(line.product.id)}
                    aria-label={t("removeButton")}
                    className="ml-1 flex h-8 w-8 items-center justify-center rounded-full text-red-400 hover:bg-red-500/10"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </Card>
      )}

      <Card className="px-4 py-3.5">
        <p className="text-lg font-semibold text-white">
          {t("totalLabel", { total: total.toLocaleString() })}
        </p>
      </Card>

      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setPaymentMethod("cash")}
            aria-pressed={paymentMethod === "cash"}
            className={`flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition-colors ${
              paymentMethod === "cash"
                ? "border-green-600 bg-green-600/10 text-green-500"
                : "border-zinc-800 text-zinc-300"
            }`}
          >
            <Banknote size={16} />
            {t("paymentCash")}
          </button>
          <button
            type="button"
            onClick={() => setPaymentMethod("mpesa")}
            disabled={!mpesaEligible}
            aria-pressed={paymentMethod === "mpesa"}
            className={`flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition-colors disabled:opacity-40 ${
              paymentMethod === "mpesa"
                ? "border-green-600 bg-green-600/10 text-green-500"
                : "border-zinc-800 text-zinc-300"
            }`}
          >
            <Smartphone size={16} />
            {t("paymentMpesa")}
          </button>
        </div>
        {!mpesaEligible && <p className="text-sm text-zinc-500">{t("mpesaSingleItemOnly")}</p>}
      </div>

      <button
        type="button"
        onClick={handleConfirm}
        disabled={!canConfirm}
        className={buttonStyles("primary", "lg", "w-full")}
      >
        {paymentMethod === "mpesa" ? t("payWithMpesaButton") : t("confirmButton")}
      </button>
    </Screen>
  );
}
