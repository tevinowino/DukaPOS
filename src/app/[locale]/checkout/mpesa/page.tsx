"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CheckCircle2, Clock, Loader2, Smartphone } from "lucide-react";
import { getProduct, applyStockDelta } from "@/lib/db/products";
import { getShopProfile } from "@/lib/identity/shopIdentity";
import { db, type Product } from "@/lib/db/schema";
import { enqueue } from "@/lib/sync/queue";
import { Card } from "@/components/ui/Card";
import { Screen } from "@/components/ui/Screen";
import { buttonStyles } from "@/components/ui/button";

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
      <Screen size="narrow" className="items-center justify-center text-center">
        <p role="alert" className="text-sm text-red-400">
          {errorMessage ?? t("genericError")}
        </p>
        <Link href="/sell" className="text-sm text-zinc-400 underline underline-offset-2">
          {t("backToSale")}
        </Link>
      </Screen>
    );
  }

  if (phase === "enterPhone" && product) {
    const total = product.priceKES * quantity;
    return (
      <Screen size="narrow" className="items-center">
        <Link
          href="/sell"
          className="self-start text-sm text-zinc-400 underline underline-offset-2"
        >
          {t("backToSale")}
        </Link>
        <h1 className="text-2xl font-semibold text-white">{t("title")}</h1>
        <Card variant="light" className="w-full px-6 py-8">
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-green-500/15 text-green-600">
              <Smartphone size={20} />
            </span>
            <p className="text-sm text-zinc-600">
              {t("summary", { name: product.name, quantity, total: total.toLocaleString() })}
            </p>
          </div>
          <label className="flex flex-col gap-1.5 text-left text-sm font-medium text-zinc-700">
            {t("phoneLabel")}
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              inputMode="tel"
              className="rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-3 text-base text-zinc-900 outline-none focus:border-green-600 focus:bg-white"
            />
          </label>
          <button
            type="button"
            onClick={handleInitiate}
            disabled={!phone.trim()}
            className={buttonStyles("primary", "lg", "mt-4 w-full")}
          >
            {t("sendPushButton")}
          </button>
        </Card>
      </Screen>
    );
  }

  if (phase === "initiating") {
    return (
      <Screen size="narrow" className="items-center justify-center text-center">
        <Loader2 size={28} className="animate-spin text-green-500" />
        <p className="text-sm text-zinc-400">{t("initiating")}</p>
      </Screen>
    );
  }

  if (phase === "waiting") {
    return (
      <Screen size="narrow" className="items-center justify-center text-center">
        <Loader2 size={28} className="animate-spin text-green-500" />
        <p className="text-lg font-medium text-white">{t("waitingTitle")}</p>
        <p className="text-sm text-zinc-400">{t("waitingBody")}</p>
      </Screen>
    );
  }

  if (phase === "timeout") {
    return (
      <Screen size="narrow" className="items-center justify-center text-center">
        <Clock size={28} className="text-amber-500" />
        <p className="text-sm text-amber-400">{t("timeoutMessage")}</p>
        <Link href="/" className="text-sm text-zinc-400 underline underline-offset-2">
          {t("backToHome")}
        </Link>
      </Screen>
    );
  }

  return (
    <Screen size="narrow" className="items-center justify-center text-center">
      <CheckCircle2 size={28} className="text-green-500" />
      <p className="text-lg font-medium text-green-400">{t("successMessage")}</p>
      <Link href="/" className="text-sm text-zinc-400 underline underline-offset-2">
        {t("backToHome")}
      </Link>
    </Screen>
  );
}
