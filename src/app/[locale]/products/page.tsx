"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useLiveQuery } from "dexie-react-hooks";
import { Package, Plus, Search } from "lucide-react";
import { getStockStatus, isAvailable, listProducts, type StockStatus } from "@/lib/db/products";
import { BottomNav } from "@/components/ui/BottomNav";
import { Screen } from "@/components/ui/Screen";

type Filter = "all" | "low" | "out";

const BADGE_STYLES: Record<StockStatus, string> = {
  good: "bg-green-500/15 text-green-500",
  low: "bg-amber-500/15 text-amber-500",
  out: "bg-red-500/15 text-red-500",
};

export default function ProductsPage() {
  const t = useTranslations("products");
  const products = useLiveQuery(() => listProducts(), []);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = (products ?? []).filter((product) => {
    const status = getStockStatus(product.stockQty);
    if (filter === "low" && status !== "low") return false;
    if (filter === "out" && status !== "out") return false;
    return product.name.toLowerCase().includes(query.trim().toLowerCase());
  });

  return (
    <>
      <Screen size="wide" padBottomNav>
        <Link href="/" className="text-sm text-zinc-400 underline underline-offset-2">
          {t("backToHome")}
        </Link>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-white">{t("title")}</h1>
          <Link
            href="/products/new"
            className="rounded-xl bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-500"
          >
            {t("addButton")}
          </Link>
        </div>

        {products !== undefined && products.length > 0 && (
          <>
            <label className="relative block">
              <Search size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-zinc-500" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("searchPlaceholder")}
                aria-label={t("searchPlaceholder")}
                className="w-full rounded-2xl border border-zinc-800 bg-zinc-900/60 py-3 pr-4 pl-10 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-green-600"
              />
            </label>

            <div className="flex gap-2">
              {(
                [
                  ["all", t("filterAll")],
                  ["low", t("filterLowStock")],
                  ["out", t("filterOutOfStock")],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilter(value)}
                  aria-pressed={filter === value}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                    filter === value
                      ? "bg-green-600 text-white"
                      : "border border-zinc-800 text-zinc-400 hover:bg-zinc-900"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </>
        )}

        {products === undefined ? null : products.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
            <p className="text-lg font-medium text-zinc-200">{t("emptyTitle")}</p>
            <p className="text-sm text-zinc-500">{t("emptyBody")}</p>
            <Link
              href="/products/new"
              className="mt-2 rounded-xl bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-500"
            >
              {t("addButton")}
            </Link>
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500">{t("noResultsFound")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {filtered.map((product) => {
              const status = getStockStatus(product.stockQty);
              return (
                <li key={product.id}>
                  <Link
                    href={`/products/${product.id}/edit`}
                    className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 px-4 py-3.5 text-left transition-colors hover:bg-zinc-900"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-zinc-800 text-zinc-400">
                      <Package size={18} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <p className="truncate text-base font-medium text-zinc-100">{product.name}</p>
                      <p className="truncate text-sm text-zinc-500">{product.category}</p>
                    </span>
                    <span className="flex flex-col items-end gap-1">
                      <span className="text-sm font-semibold text-white">
                        KES {product.priceKES.toLocaleString()}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${BADGE_STYLES[status]}`}>
                        {product.stockQty > 0
                          ? t("inStock", { count: product.stockQty })
                          : t("outOfStock")}
                      </span>
                      {!isAvailable(product) && (
                        <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-400">
                          {t("unavailableBadge")}
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

      </Screen>
      {products !== undefined && products.length > 0 && (
        // A `fixed` button anchored to the viewport's right edge would
        // drift away from the content column on a wide desktop screen
        // (Screen centers into a max-w-2xl column, not full-bleed) — this
        // outer layer mirrors that same centering so the button's
        // horizontal position always matches the column above it, while
        // still staying pinned to the bottom of the viewport vertically.
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-10">
          <div className="mx-auto flex w-full max-w-2xl justify-end px-4">
            <Link
              href="/products/new"
              aria-label={t("addButton")}
              className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-600 text-white shadow-lg shadow-black/40 transition-colors hover:bg-green-500"
            >
              <Plus size={24} />
            </Link>
          </div>
        </div>
      )}
      <BottomNav />
    </>
  );
}
