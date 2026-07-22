"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { getProduct, applyStockDelta } from "@/lib/db/products";
import { getShopProfile } from "@/lib/identity/shopIdentity";
import { db, type Product } from "@/lib/db/schema";
import { enqueue } from "@/lib/sync/queue";

/** Per ADR-3: poll every 3s, give up (not fail — the payment may still complete later) after 90s. */
const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 90_000;

type Phase =
  | "loading"
  | "enterPhone"
  | "initiating"
  | "waiting"
  | "success"
  | "timeout"
  | "error";

/**
 * Single-product-line M-Pesa checkout (see this phase's overview.md for
 * why this doesn't support Phase 4's multi-item cart the way cash does).
 * Reached from the sell page with `?productId=&quantity=`.
 */
export default function MpesaCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ productId?: string; quantity?: string }>;
}) {
  const { productId, quantity: quantityParam } = use(searchParams);
  const quantity = Math.max(1, Number(quantityParam) || 1);
  const t = useTranslations("mpesaCheckout");

  const [phase, setPhase] = useState<Phase>("loading");
  const [product, setProduct] = useState<Product | null>(null);
  const [shopId, setShopId] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [reference, setReference] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!productId) {
        if (!cancelled) setPhase("error");
        return;
      }
      const [loadedProduct, profile] = await Promise.all([
        getProduct(productId),
        getShopProfile(),
      ]);
      if (cancelled) {
        return;
      }
      if (!loadedProduct || !profile) {
        setPhase("error");
        return;
      }
      setProduct(loadedProduct);
      setShopId(profile.shopId);
      setPhone(profile.phoneE164);
      setPhase("enterPhone");
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [productId]);

  async function handleInitiate() {
    if (!product || !shopId) {
      return;
    }
    setPhase("initiating");
    setErrorMessage(null);

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId, productId: product.id, quantity, phone }),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error ?? "Checkout failed");
      }
      setReference(body.reference);
      setPhase("waiting");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("genericError"));
      setPhase("error");
    }
  }

  useEffect(() => {
    if (phase !== "waiting" || !reference || !shopId || !product) {
      return;
    }

    let cancelled = false;
    const startedAt = Date.now();
    let timeoutHandle: ReturnType<typeof setTimeout>;

    async function markLocalCompletion() {
      // Mirrors what the Convex mutation already did — apply the same
      // stock decrement and mark the local Transaction completed, or the
      // local-first UI would show stale stock until the next general
      // sync (ADR-3's whole point). Same `id` as the Convex `localId`
      // and Paystack `reference` (unified — see paystackClient.ts /
      // convex/transactions.ts's markPending), so this upserts cleanly
      // onto the same row if it's later re-synced.
      await applyStockDelta(product!.id, -quantity);
      const transaction = {
        id: reference!,
        productId: product!.id,
        productName: product!.name,
        quantity,
        totalKES: product!.priceKES * quantity,
        paymentMethod: "mpesa" as const,
        status: "completed" as const,
        createdAt: Date.now(),
        saleGroupId: reference!,
      };
      await db.transactions.add(transaction);
      await enqueue({ type: "transaction", payload: transaction });
    }

    async function poll() {
      if (cancelled) {
        return;
      }
      try {
        const response = await fetch(
          `/api/checkout/status?shopId=${encodeURIComponent(shopId!)}&reference=${encodeURIComponent(reference!)}`,
        );
        const body = await response.json();
        if (cancelled) {
          return;
        }
        if (response.ok && body.status === "completed") {
          await markLocalCompletion();
          if (!cancelled) {
            setPhase("success");
          }
          return;
        }
      } catch {
        // Transient poll failure — retry on the next tick rather than failing the whole flow.
      }

      if (Date.now() - startedAt >= POLL_TIMEOUT_MS) {
        if (!cancelled) {
          setPhase("timeout");
        }
        return;
      }
      timeoutHandle = setTimeout(poll, POLL_INTERVAL_MS);
    }

    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timeoutHandle);
    };
  }, [phase, reference, shopId, product, quantity]);

  if (phase === "loading") {
    return null;
  }

  if (phase === "error") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <p role="alert" className="text-sm text-red-600">
          {errorMessage ?? t("genericError")}
        </p>
        <Link href="/sell" className="text-sm underline">
          {t("backToSale")}
        </Link>
      </main>
    );
  }

  if (phase === "enterPhone" && product) {
    const total = product.priceKES * quantity;
    return (
      <main className="flex flex-1 flex-col items-center gap-4 p-4">
        <Link href="/sell" className="self-start text-sm underline">
          {t("backToSale")}
        </Link>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {t("summary", { name: product.name, quantity, total: total.toLocaleString() })}
        </p>
        <label className="flex w-full max-w-sm flex-col gap-1 text-sm">
          {t("phoneLabel")}
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            inputMode="tel"
            className="rounded border px-3 py-2 text-base"
          />
        </label>
        <button
          type="button"
          onClick={handleInitiate}
          disabled={!phone.trim()}
          className="w-full max-w-sm rounded bg-zinc-900 py-3 text-base font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {t("sendPushButton")}
        </button>
      </main>
    );
  }

  if (phase === "initiating") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-sm text-zinc-500">{t("initiating")}</p>
      </main>
    );
  }

  if (phase === "waiting") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-lg font-medium">{t("waitingTitle")}</p>
        <p className="text-sm text-zinc-500">{t("waitingBody")}</p>
      </main>
    );
  }

  if (phase === "timeout") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-sm text-amber-600">{t("timeoutMessage")}</p>
        <Link href="/" className="text-sm underline">
          {t("backToHome")}
        </Link>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-lg font-medium text-green-700 dark:text-green-400">
        {t("successMessage")}
      </p>
      <Link href="/" className="text-sm underline">
        {t("backToHome")}
      </Link>
    </main>
  );
}
