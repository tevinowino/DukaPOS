"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useLiveQuery } from "dexie-react-hooks";
import { listProducts, applyStockDelta } from "@/lib/db/products";
import { useOnlineSync } from "@/lib/sync/useOnlineSync";
import type { StockUpdate } from "@/lib/ai/types";

interface EditableLine extends StockUpdate {
  /** Stable React key independent of array index, since removing a line shifts indices. */
  key: string;
}

function parseQuantityInput(raw: string): number | undefined {
  if (!/^\d+$/.test(raw.trim())) {
    return undefined;
  }
  const value = Number(raw.trim());
  return value > 0 ? value : undefined;
}

export default function StockUpdatePage() {
  const t = useTranslations("stockUpdate");
  const products = useLiveQuery(() => listProducts(), []) ?? [];
  const { status: syncStatus } = useOnlineSync();
  const isOnline = syncStatus !== "offline";

  const [text, setText] = useState("");
  const [status, setStatus] = useState<"idle" | "parsing" | "parseFailed" | "offline">("idle");
  const [lines, setLines] = useState<EditableLine[] | null>(null);
  const [applyResult, setApplyResult] = useState<{ applied: number; lineErrors: string[] } | null>(
    null,
  );

  async function handleParse() {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }

    if (!isOnline) {
      setStatus("offline");
      return;
    }

    setStatus("parsing");
    setLines(null);
    setApplyResult(null);

    try {
      const response = await fetch("/api/parse-stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed, existingProducts: products }),
      });
      if (!response.ok) {
        throw new Error("parse failed");
      }
      const body = (await response.json()) as { updates: StockUpdate[] };
      setLines(body.updates.map((update, index) => ({ ...update, key: `${Date.now()}-${index}` })));
      setStatus("idle");
    } catch {
      setStatus("parseFailed");
    }
  }

  function updateQuantity(key: string, raw: string) {
    setLines((prev) =>
      prev
        ? prev.map((line) =>
            line.key === key ? { ...line, quantityDelta: parseQuantityInput(raw) } : line,
          )
        : prev,
    );
  }

  function removeLine(key: string) {
    setLines((prev) => (prev ? prev.filter((line) => line.key !== key) : prev));
  }

  async function handleApply() {
    if (!lines) {
      return;
    }

    const ready = lines.filter(
      (line) => line.productId && typeof line.quantityDelta === "number",
    );

    let applied = 0;
    const lineErrors: string[] = [];

    for (const line of ready) {
      const delta = line.direction === "increase" ? line.quantityDelta! : -line.quantityDelta!;
      try {
        await applyStockDelta(line.productId!, delta);
        applied += 1;
      } catch {
        lineErrors.push(t("lineApplyFailed", { name: line.productNameGuess }));
      }
    }

    setApplyResult({ applied, lineErrors });
    setLines((prev) => (prev ? prev.filter((line) => !ready.includes(line)) : prev));
  }

  const readyCount = lines?.filter((line) => line.productId && typeof line.quantityDelta === "number")
    .length ?? 0;

  return (
    <main className="flex flex-1 flex-col gap-4 p-4">
      <Link href="/" className="text-sm underline">
        {t("backToHome")}
      </Link>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={t("placeholder")}
        aria-label={t("inputLabel")}
        rows={3}
        className="w-full max-w-sm rounded border px-3 py-2 text-base"
      />
      <button
        type="button"
        onClick={handleParse}
        disabled={!text.trim() || status === "parsing"}
        className="w-full max-w-sm rounded bg-zinc-900 py-3 text-base font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {status === "parsing" ? t("parsing") : t("parseButton")}
      </button>

      {status === "parseFailed" && (
        <p role="alert" className="text-sm text-red-600">
          {t("parseFailedMessage")}
        </p>
      )}

      {status === "offline" && (
        <p role="alert" className="text-sm text-amber-600">
          {t("offlineMessage")}
        </p>
      )}

      {lines && lines.length > 0 && (
        <ul className="flex flex-col gap-2">
          {lines.map((line) => {
            const matchedProduct = line.productId
              ? products.find((product) => product.id === line.productId)
              : undefined;
            return (
              <li key={line.key} className="flex flex-col gap-2 rounded border p-3">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{matchedProduct?.name ?? line.productNameGuess}</p>
                  <span className="text-sm">
                    {line.direction === "increase" ? "+" : "−"}
                  </span>
                </div>
                {!line.productId && (
                  <p className="text-sm text-amber-600">
                    {t("unmatchedProduct")}{" "}
                    <Link href="/products/new" className="underline">
                      {t("addProductLink")}
                    </Link>
                  </p>
                )}
                <input
                  type="number"
                  min={1}
                  value={line.quantityDelta ?? ""}
                  onChange={(event) => updateQuantity(line.key, event.target.value)}
                  aria-label={t("quantityLabel", { name: line.productNameGuess })}
                  placeholder={t("quantityPlaceholder")}
                  className="w-24 rounded border px-2 py-1 text-center"
                />
                <button
                  type="button"
                  onClick={() => removeLine(line.key)}
                  className="self-start text-sm text-red-600 underline"
                >
                  {t("removeButton")}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {lines && lines.length > 0 && (
        <button
          type="button"
          onClick={handleApply}
          disabled={readyCount === 0}
          className="w-full max-w-sm rounded bg-zinc-900 py-3 text-base font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {t("applyButton", { count: readyCount })}
        </button>
      )}

      {applyResult && (
        <div className="flex flex-col gap-1">
          <p className="text-sm text-green-700 dark:text-green-400">
            {t("applySuccess", { count: applyResult.applied })}
          </p>
          {applyResult.lineErrors.map((message) => (
            <p key={message} role="alert" className="text-sm text-red-600">
              {message}
            </p>
          ))}
        </div>
      )}
    </main>
  );
}
