"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CheckCircle2 } from "lucide-react";
import { addProduct } from "@/lib/db/products";
import { useOnlineSync } from "@/lib/sync/useOnlineSync";
import type { ProductGuess } from "@/lib/ai/types";
import { PhotoCapture } from "@/components/PhotoCapture";
import { ProductForm, type ProductFormValues } from "@/components/ProductForm";
import { Card } from "@/components/ui/Card";
import { Screen } from "@/components/ui/Screen";

type View =
  | { step: "capture" }
  | { step: "identifying" }
  | { step: "confirm"; guess: ProductGuess }
  | { step: "failed"; message: string };

/**
 * AI output (`ProductGuess`) is never auto-saved — every path through this
 * page requires the shopkeeper to confirm via `ProductForm`'s explicit
 * submit, and `handleSubmit` always uses the form's current (editable)
 * values, never the raw guess directly (PRD §9).
 */
export default function PhotoProductPage() {
  const t = useTranslations("photoProduct");
  const router = useRouter();
  const [view, setView] = useState<View>({ step: "capture" });
  // Reuses Phase 5's online/offline detection (global-rules DRY, and this
  // phase's own audit mandate) rather than the separate listener this page
  // originally rolled on its own in Phase 6.
  const { status: syncStatus } = useOnlineSync();
  const isOnline = syncStatus !== "offline";

  async function handleCapture(photo: Blob) {
    if (!isOnline) {
      setView({ step: "failed", message: t("offlineMessage") });
      return;
    }

    setView({ step: "identifying" });

    const formData = new FormData();
    formData.append("image", photo, "photo.jpg");

    try {
      const response = await fetch("/api/identify-product", { method: "POST", body: formData });
      if (!response.ok) {
        throw new Error("Identification failed");
      }
      const guess = (await response.json()) as ProductGuess;
      setView({ step: "confirm", guess });
    } catch {
      setView({ step: "failed", message: t("identifyFailedMessage") });
    }
  }

  async function handleSubmit(values: ProductFormValues) {
    await addProduct({ ...values, source: "photo" });
    router.push("/products");
  }

  if (view.step === "capture") {
    return (
      <Screen size="narrow" className="items-center">
        <Link
          href="/products/new"
          className="self-start text-sm text-zinc-400 underline underline-offset-2"
        >
          {t("backToAddProduct")}
        </Link>
        <h1 className="text-2xl font-semibold text-white">{t("title")}</h1>
        {!isOnline && (
          <p role="alert" className="text-sm text-amber-400">
            {t("offlineMessage")}
          </p>
        )}
        <PhotoCapture onCapture={handleCapture} />
      </Screen>
    );
  }

  if (view.step === "identifying") {
    return (
      <Screen size="narrow" className="items-center justify-center text-center">
        <p className="text-sm text-zinc-400">{t("identifying")}</p>
      </Screen>
    );
  }

  if (view.step === "failed") {
    return (
      <Screen size="narrow" className="items-center">
        <p role="alert" className="text-sm text-red-400">
          {view.message}
        </p>
        <Card variant="light" className="w-full px-6 py-8">
          <ProductForm mode="create" onSubmit={handleSubmit} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen size="narrow" className="items-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500/15 text-green-500">
        <CheckCircle2 size={28} />
      </span>
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-white">{t("confirmTitle")}</h1>
      </div>
      <Card variant="light" className="w-full px-6 py-8">
        <ProductForm
          mode="create"
          initialValues={{
            name: view.guess.name,
            category: view.guess.category,
            priceKES: view.guess.estimatedPriceKES,
          }}
          onSubmit={handleSubmit}
        />
      </Card>
    </Screen>
  );
}
