"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { addProduct, getProductByBarcode } from "@/lib/db/products";
import type { Product } from "@/lib/db/schema";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { ProductForm, type ProductFormValues } from "@/components/ProductForm";

type View =
  | { step: "choose" }
  | { step: "scanning" }
  | { step: "form"; barcode?: string }
  | { step: "duplicateFound"; product: Product };

export default function NewProductPage() {
  const t = useTranslations("products");
  const router = useRouter();
  const [view, setView] = useState<View>({ step: "choose" });

  async function handleDetect(barcode: string) {
    const existing = await getProductByBarcode(barcode);
    setView(existing ? { step: "duplicateFound", product: existing } : { step: "form", barcode });
  }

  async function handleSubmit(values: ProductFormValues) {
    await addProduct({ ...values, source: values.barcode ? "barcode" : "manual" });
    router.push("/products");
  }

  if (view.step === "choose") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
        <Link href="/products" className="self-start text-sm underline">
          {t("backToStock")}
        </Link>
        <h1 className="text-2xl font-semibold">{t("newTitle")}</h1>
        <button
          type="button"
          onClick={() => setView({ step: "scanning" })}
          className="w-full max-w-sm rounded bg-zinc-900 py-3 text-base font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          {t("scanBarcodeButton")}
        </button>
        <Link
          href="/products/new/photo"
          className="w-full max-w-sm rounded border py-3 text-center text-base font-medium"
        >
          {t("addViaPhotoButton")}
        </Link>
        <button
          type="button"
          onClick={() => setView({ step: "form" })}
          className="w-full max-w-sm rounded border py-3 text-base font-medium"
        >
          {t("addManuallyButton")}
        </button>
      </main>
    );
  }

  if (view.step === "scanning") {
    return (
      <main className="flex flex-1 flex-col gap-4 p-4">
        <h1 className="text-2xl font-semibold">{t("newTitle")}</h1>
        <BarcodeScanner
          onDetect={handleDetect}
          onManualEntry={() => setView({ step: "form" })}
        />
      </main>
    );
  }

  if (view.step === "duplicateFound") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <p>{t("duplicateFoundBody", { name: view.product.name })}</p>
        <Link
          href={`/products/${view.product.id}/edit`}
          className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          {t("duplicateFoundEditButton", { name: view.product.name })}
        </Link>
        <button
          type="button"
          onClick={() => setView({ step: "scanning" })}
          className="text-sm underline"
        >
          {t("scanAgainButton")}
        </button>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center gap-4 p-4">
      <h1 className="text-2xl font-semibold">{t("newTitle")}</h1>
      <ProductForm
        mode="create"
        initialValues={view.barcode ? { barcode: view.barcode } : undefined}
        onSubmit={handleSubmit}
      />
    </main>
  );
}
