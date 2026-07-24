"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ScanBarcode, Camera, PenLine } from "lucide-react";
import { addProduct, getProductByBarcode } from "@/lib/db/products";
import type { Product } from "@/lib/db/schema";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { ProductForm, type ProductFormValues } from "@/components/ProductForm";
import { Card } from "@/components/ui/Card";
import { Screen } from "@/components/ui/Screen";
import { buttonStyles } from "@/components/ui/button";

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
      <Screen size="narrow" className="items-center justify-center text-center">
        <Link
          href="/products"
          className="self-start text-sm text-zinc-400 underline underline-offset-2"
        >
          {t("backToStock")}
        </Link>
        <h1 className="text-2xl font-semibold text-white">{t("newTitle")}</h1>
        <button
          type="button"
          onClick={() => setView({ step: "scanning" })}
          className={buttonStyles("primary", "lg", "w-full max-w-sm gap-2")}
        >
          <ScanBarcode size={18} />
          {t("scanBarcodeButton")}
        </button>
        <Link
          href="/products/new/photo"
          className={buttonStyles("outline", "lg", "w-full max-w-sm gap-2")}
        >
          <Camera size={18} />
          {t("addViaPhotoButton")}
        </Link>
        <button
          type="button"
          onClick={() => setView({ step: "form" })}
          className={buttonStyles("outline", "lg", "w-full max-w-sm gap-2")}
        >
          <PenLine size={18} />
          {t("addManuallyButton")}
        </button>
      </Screen>
    );
  }

  if (view.step === "scanning") {
    return (
      <Screen size="narrow">
        <h1 className="text-2xl font-semibold text-white">{t("newTitle")}</h1>
        <BarcodeScanner onDetect={handleDetect} onManualEntry={() => setView({ step: "form" })} />
      </Screen>
    );
  }

  if (view.step === "duplicateFound") {
    return (
      <Screen size="narrow" className="items-center justify-center text-center">
        <Card variant="light" className="w-full px-6 py-10">
          <p className="text-zinc-700">{t("duplicateFoundBody", { name: view.product.name })}</p>
          <Link
            href={`/products/${view.product.id}/edit`}
            className={buttonStyles("primary", "lg", "mt-4 w-full")}
          >
            {t("duplicateFoundEditButton", { name: view.product.name })}
          </Link>
          <button
            type="button"
            onClick={() => setView({ step: "scanning" })}
            className="mt-3 text-sm text-zinc-500 underline underline-offset-2"
          >
            {t("scanAgainButton")}
          </button>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen size="narrow" className="items-center">
      <h1 className="text-2xl font-semibold text-white">{t("newTitle")}</h1>
      <Card variant="light" className="w-full px-6 py-8">
        <ProductForm
          mode="create"
          initialValues={view.barcode ? { barcode: view.barcode } : undefined}
          onSubmit={handleSubmit}
        />
      </Card>
    </Screen>
  );
}
