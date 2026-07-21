"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useLiveQuery } from "dexie-react-hooks";
import { listProducts } from "@/lib/db/products";
import type { Product } from "@/lib/db/schema";

interface ProductPickerProps {
  onSelect: (product: Product) => void;
}

/** Searchable list over the live product catalog, reused by the sale flow. */
export function ProductPicker({ onSelect }: ProductPickerProps) {
  const t = useTranslations("sell");
  const tProducts = useTranslations("products");
  const [search, setSearch] = useState("");
  const products = useLiveQuery(() => listProducts(), []);

  const filtered = (products ?? []).filter((product) =>
    product.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <div className="flex flex-col gap-2">
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t("searchPlaceholder")}
        aria-label={t("searchPlaceholder")}
        className="rounded border px-3 py-2 text-base"
      />
      <ul className="flex flex-col gap-1">
        {filtered.map((product) => (
          <li key={product.id}>
            <button
              type="button"
              onClick={() => onSelect(product)}
              className="flex w-full items-center justify-between rounded border px-3 py-3 text-left"
            >
              <span>{product.name}</span>
              <span className={product.stockQty === 0 ? "text-sm text-red-600" : "text-sm text-zinc-500"}>
                {product.stockQty === 0
                  ? tProducts("outOfStock")
                  : tProducts("inStock", { count: product.stockQty })}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
