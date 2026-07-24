"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useLiveQuery } from "dexie-react-hooks";
import { deleteProduct, getProduct, isAvailable, updateProduct } from "@/lib/db/products";
import { ProductForm, type ProductFormValues } from "@/components/ProductForm";
import { Card } from "@/components/ui/Card";
import { Screen } from "@/components/ui/Screen";

export default function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useTranslations("products");
  const router = useRouter();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const product = useLiveQuery(() => getProduct(id), [id]);

  async function handleSubmit(values: ProductFormValues) {
    await updateProduct(id, values);
    router.push("/products");
  }

  async function handleDelete() {
    await deleteProduct(id);
    router.push("/products");
  }

  // `undefined` covers both "still loading" and "no such product" — Dexie's
  // .get() resolves to undefined either way, and this edge case (editing a
  // deleted-elsewhere product) isn't in this phase's required scope.
  if (!product) {
    return null;
  }

  return (
    <Screen size="narrow" className="items-center">
      <Link
        href="/products"
        className="self-start text-sm text-zinc-400 underline underline-offset-2"
      >
        {t("backToStock")}
      </Link>
      <h1 className="text-2xl font-semibold text-white">{t("editTitle")}</h1>
      <Card variant="light" className="w-full px-6 py-8">
        <ProductForm
          mode="edit"
          initialValues={{
            name: product.name,
            category: product.category,
            barcode: product.barcode,
            priceKES: product.priceKES,
            stockQty: product.stockQty,
            available: isAvailable(product),
          }}
          onSubmit={handleSubmit}
        />
      </Card>

      {confirmingDelete ? (
        <div className="flex w-full max-w-sm flex-col gap-2 rounded-2xl border border-red-900 bg-red-500/10 p-4 text-center">
          <p className="text-sm text-red-300">{t("deleteConfirmBody")}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleDelete}
              className="flex-1 rounded-xl bg-red-600 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500"
            >
              {t("deleteConfirmButton")}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="flex-1 rounded-xl border border-zinc-700 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-900"
            >
              {t("cancelButton")}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmingDelete(true)}
          className="text-sm text-red-400 underline underline-offset-2"
        >
          {t("deleteButton")}
        </button>
      )}
    </Screen>
  );
}
