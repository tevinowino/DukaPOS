"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useLiveQuery } from "dexie-react-hooks";
import { deleteProduct, getProduct, updateProduct } from "@/lib/db/products";
import { ProductForm, type ProductFormValues } from "@/components/ProductForm";

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
    <main className="flex flex-1 flex-col items-center gap-4 p-4">
      <Link href="/products" className="self-start text-sm underline">
        {t("backToStock")}
      </Link>
      <h1 className="text-2xl font-semibold">{t("editTitle")}</h1>
      <ProductForm
        mode="edit"
        initialValues={{
          name: product.name,
          category: product.category,
          barcode: product.barcode,
          priceKES: product.priceKES,
          stockQty: product.stockQty,
        }}
        onSubmit={handleSubmit}
      />

      {confirmingDelete ? (
        <div className="flex w-full max-w-sm flex-col gap-2 rounded border border-red-300 p-4 text-center">
          <p className="text-sm">{t("deleteConfirmBody")}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleDelete}
              className="flex-1 rounded bg-red-600 py-2 text-sm font-medium text-white"
            >
              {t("deleteConfirmButton")}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="flex-1 rounded border py-2 text-sm font-medium"
            >
              {t("cancelButton")}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmingDelete(true)}
          className="text-sm text-red-600 underline"
        >
          {t("deleteButton")}
        </button>
      )}
    </main>
  );
}
