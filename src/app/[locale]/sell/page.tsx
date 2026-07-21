"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { recordCashSale } from "@/lib/db/transactions";
import type { Product } from "@/lib/db/schema";
import { ProductPicker } from "@/components/ProductPicker";

interface SaleLine {
  product: Product;
  quantity: number;
}

export default function SellPage() {
  const t = useTranslations("sell");
  const router = useRouter();
  const [lines, setLines] = useState<SaleLine[]>([]);
  const [picking, setPicking] = useState(false);

  function addProduct(product: Product) {
    setPicking(false);
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
  const canConfirm = lines.length > 0 && lines.every((line) => line.quantity >= 1);

  async function handleConfirm() {
    if (!canConfirm) {
      return;
    }
    await recordCashSale(lines.map((line) => ({ productId: line.product.id, quantity: line.quantity })));
    router.push("/transactions");
  }

  return (
    <main className="flex flex-1 flex-col gap-4 p-4">
      <Link href="/" className="text-sm underline">
        {t("backToHome")}
      </Link>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      {picking ? (
        <ProductPicker onSelect={addProduct} />
      ) : (
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="rounded border py-3 text-base font-medium"
        >
          {t("addProductButton")}
        </button>
      )}

      {lines.length > 0 && (
        <ul className="flex flex-col gap-2">
          {lines.map((line) => {
            const overStock = line.quantity > line.product.stockQty;
            return (
              <li
                key={line.product.id}
                className="flex items-center justify-between rounded border px-3 py-3"
              >
                <div>
                  <p className="font-medium">{line.product.name}</p>
                  {overStock && (
                    <p className="text-sm text-amber-600">
                      {t("lowStockWarning", { count: line.product.stockQty })}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    value={line.quantity}
                    onChange={(e) => updateQuantity(line.product.id, Number(e.target.value))}
                    aria-label={t("quantityLabel", { name: line.product.name })}
                    className="w-16 rounded border px-2 py-1 text-center"
                  />
                  <button
                    type="button"
                    onClick={() => removeLine(line.product.id)}
                    className="text-sm text-red-600 underline"
                  >
                    {t("removeButton")}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-lg font-semibold">{t("totalLabel", { total: total.toLocaleString() })}</p>

      <div className="flex gap-2">
        <span className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
          {t("paymentCash")}
        </span>
        <span aria-disabled="true" className="rounded border px-4 py-2 text-sm text-zinc-400">
          {t("paymentMpesaComingSoon")}
        </span>
      </div>

      <button
        type="button"
        onClick={handleConfirm}
        disabled={!canConfirm}
        className="rounded bg-zinc-900 py-3 text-base font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {t("confirmButton")}
      </button>
    </main>
  );
}
