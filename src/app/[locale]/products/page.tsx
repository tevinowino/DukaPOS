"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useLiveQuery } from "dexie-react-hooks";
import { listProducts } from "@/lib/db/products";

export default function ProductsPage() {
  const t = useTranslations("products");
  const products = useLiveQuery(() => listProducts(), []);

  return (
    <main className="flex flex-1 flex-col gap-4 p-4">
      <Link href="/" className="text-sm underline">
        {t("backToHome")}
      </Link>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <Link
          href="/products/new"
          className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          {t("addButton")}
        </Link>
      </div>

      {products === undefined ? null : products.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <p className="text-lg font-medium">{t("emptyTitle")}</p>
          <p className="text-sm text-zinc-500">{t("emptyBody")}</p>
          <Link
            href="/products/new"
            className="mt-2 rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            {t("addButton")}
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {products.map((product) => (
            <li key={product.id}>
              <Link
                href={`/products/${product.id}/edit`}
                className="flex items-center justify-between rounded border px-4 py-4 text-left"
              >
                <div>
                  <p className="text-base font-medium">{product.name}</p>
                  <p className="text-sm text-zinc-500">
                    {product.stockQty > 0
                      ? t("inStock", { count: product.stockQty })
                      : t("outOfStock")}
                  </p>
                </div>
                <p className="text-base font-semibold">
                  KES {product.priceKES.toLocaleString()}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
