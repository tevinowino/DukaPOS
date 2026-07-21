"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";

export interface ProductFormValues {
  name: string;
  category: string;
  barcode?: string;
  priceKES: number;
  stockQty: number;
}

interface ProductFormProps {
  mode: "create" | "edit";
  /**
   * Partial on purpose: edit mode passes a full product's fields, while
   * the create flow's barcode-scan entry point only has a `barcode` to
   * seed — neither needs the product's `id`, so this takes plain form
   * values rather than a `Product`.
   */
  initialValues?: Partial<ProductFormValues>;
  onSubmit: (values: ProductFormValues) => void;
}

/** A non-negative integer typed as free text — "12", not "12.5" or "-3". */
function parseNonNegativeInteger(raw: string): number | null {
  if (!/^\d+$/.test(raw.trim())) {
    return null;
  }
  return Number(raw.trim());
}

/**
 * Shared add/edit form. One component reused via `mode` + `initialValues`
 * rather than duplicated markup (global-rules §2) — this is UI reuse, not
 * the multi-step "temporal decomposition" that rule forbids.
 */
export function ProductForm({ mode, initialValues, onSubmit }: ProductFormProps) {
  const t = useTranslations("productForm");
  const [name, setName] = useState(initialValues?.name ?? "");
  const [category, setCategory] = useState(initialValues?.category ?? "");
  const [barcode, setBarcode] = useState(initialValues?.barcode ?? "");
  const [priceKES, setPriceKES] = useState(
    initialValues?.priceKES !== undefined ? String(initialValues.priceKES) : "",
  );
  const [stockQty, setStockQty] = useState(
    initialValues?.stockQty !== undefined ? String(initialValues.stockQty) : "",
  );
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (!name.trim()) {
      setError(t("nameRequired"));
      return;
    }

    const price = parseNonNegativeInteger(priceKES);
    if (price === null) {
      setError(t("priceInvalid"));
      return;
    }

    const stock = parseNonNegativeInteger(stockQty);
    if (stock === null) {
      setError(t("stockInvalid"));
      return;
    }

    const trimmedBarcode = barcode.trim();
    if (trimmedBarcode && !/^\d+$/.test(trimmedBarcode)) {
      setError(t("barcodeInvalid"));
      return;
    }

    setError(null);
    onSubmit({
      name: name.trim(),
      category: category.trim(),
      barcode: trimmedBarcode || undefined,
      priceKES: price,
      stockQty: stock,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-3">
      <label className="flex flex-col gap-1 text-left text-sm">
        {t("nameLabel")}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded border px-3 py-2 text-base"
        />
      </label>
      <label className="flex flex-col gap-1 text-left text-sm">
        {t("categoryLabel")}
        <input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded border px-3 py-2 text-base"
        />
      </label>
      <label className="flex flex-col gap-1 text-left text-sm">
        {t("barcodeLabel")}
        <input
          value={barcode}
          onChange={(e) => setBarcode(e.target.value)}
          inputMode="numeric"
          className="rounded border px-3 py-2 text-base"
        />
      </label>
      <label className="flex flex-col gap-1 text-left text-sm">
        {t("priceLabel")}
        <input
          value={priceKES}
          onChange={(e) => setPriceKES(e.target.value)}
          inputMode="numeric"
          className="rounded border px-3 py-2 text-base"
        />
      </label>
      <label className="flex flex-col gap-1 text-left text-sm">
        {t("stockLabel")}
        <input
          value={stockQty}
          onChange={(e) => setStockQty(e.target.value)}
          inputMode="numeric"
          className="rounded border px-3 py-2 text-base"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <button
        type="submit"
        className="rounded bg-zinc-900 py-2 text-base font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
      >
        {mode === "create" ? t("saveButton") : t("saveChangesButton")}
      </button>
    </form>
  );
}
