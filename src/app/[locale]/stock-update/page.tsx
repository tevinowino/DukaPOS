"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useLiveQuery } from "dexie-react-hooks";
import { Sparkles } from "lucide-react";
import { listProducts, applyStockDelta } from "@/lib/db/products";
import { useOnlineSync } from "@/lib/sync/useOnlineSync";
import type { StockUpdate } from "@/lib/ai/types";
import { Card } from "@/components/ui/Card";
import { Screen } from "@/components/ui/Screen";
import { buttonStyles } from "@/components/ui/button";
import { BottomNav } from "@/components/ui/BottomNav";

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
    <>
      <Screen size="wide" padBottomNav>
        <Link href="/" className="text-sm text-zinc-400 underline underline-offset-2">
          {t("backToHome")}
        </Link>
        <h1 className="text-2xl font-semibold text-white">{t("title")}</h1>

        <Card variant="light" className="p-5">
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={t("placeholder")}
            aria-label={t("inputLabel")}
            rows={3}
            className="w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-3 text-base text-zinc-900 outline-none focus:border-green-600 focus:bg-white"
          />
          <button
            type="button"
            onClick={handleParse}
            disabled={!text.trim() || status === "parsing"}
            className={buttonStyles("primary", "lg", "mt-3 w-full gap-2")}
          >
            <Sparkles size={16} />
            {status === "parsing" ? t("parsing") : t("parseButton")}
          </button>
        </Card>

        {status === "parseFailed" && (
          <p role="alert" className="text-sm text-red-400">
            {t("parseFailedMessage")}
          </p>
        )}

        {status === "offline" && (
          <p role="alert" className="text-sm text-amber-400">
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
                <li key={line.key}>
                  <Card className="flex flex-col gap-2 p-4">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-zinc-100">
                        {matchedProduct?.name ?? line.productNameGuess}
                      </p>
                      <span
                        className={`text-sm font-semibold ${
                          line.direction === "increase" ? "text-green-500" : "text-red-400"
                        }`}
                      >
                        {line.direction === "increase" ? "+" : "−"}
                      </span>
                    </div>
                    {!line.productId && (
                      <p className="text-sm text-amber-400">
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
                      className="w-24 rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1 text-center text-zinc-100"
                    />
                    <button
                      type="button"
                      onClick={() => removeLine(line.key)}
                      className="self-start text-sm text-red-400 underline"
                    >
                      {t("removeButton")}
                    </button>
                  </Card>
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
            className={buttonStyles("primary", "lg", "w-full")}
          >
            {t("applyButton", { count: readyCount })}
          </button>
        )}

        {applyResult && (
          <div className="flex flex-col gap-1">
            <p className="text-sm text-green-500">{t("applySuccess", { count: applyResult.applied })}</p>
            {applyResult.lineErrors.map((message) => (
              <p key={message} role="alert" className="text-sm text-red-400">
                {message}
              </p>
            ))}
          </div>
        )}
      </Screen>
      <BottomNav />
    </>
  );
}
