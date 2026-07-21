"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { addProduct } from "@/lib/db/products";
import type { ProductGuess } from "@/lib/ai/types";
import { PhotoCapture } from "@/components/PhotoCapture";
import { ProductForm, type ProductFormValues } from "@/components/ProductForm";

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
  const [isOnline, setIsOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine,
  );

  useEffect(() => {
    function updateOnlineStatus() {
      setIsOnline(navigator.onLine);
    }
    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);
    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
    };
  }, []);

  async function handleCapture(photo: Blob) {
    if (!navigator.onLine) {
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
      <main className="flex flex-1 flex-col items-center gap-4 p-4">
        <Link href="/products/new" className="self-start text-sm underline">
          {t("backToAddProduct")}
        </Link>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        {!isOnline && (
          <p role="alert" className="text-sm text-amber-600">
            {t("offlineMessage")}
          </p>
        )}
        <PhotoCapture onCapture={handleCapture} />
      </main>
    );
  }

  if (view.step === "identifying") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-sm text-zinc-500">{t("identifying")}</p>
      </main>
    );
  }

  if (view.step === "failed") {
    return (
      <main className="flex flex-1 flex-col items-center gap-4 p-4">
        <p role="alert" className="text-sm text-red-600">
          {view.message}
        </p>
        <ProductForm mode="create" onSubmit={handleSubmit} />
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center gap-4 p-4">
      <h1 className="text-2xl font-semibold">{t("confirmTitle")}</h1>
      <ProductForm
        mode="create"
        initialValues={{
          name: view.guess.name,
          category: view.guess.category,
          priceKES: view.guess.estimatedPriceKES,
        }}
        onSubmit={handleSubmit}
      />
    </main>
  );
}
