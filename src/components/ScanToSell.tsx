"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, Keyboard, Loader2, ScanBarcode, Search } from "lucide-react";
import { addProduct, getProductByBarcode, listProducts, matchProductByName } from "@/lib/db/products";
import type { Product } from "@/lib/db/schema";
import type { ProductGuess } from "@/lib/ai/types";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { ProductPicker } from "@/components/ProductPicker";
import { Card } from "@/components/ui/Card";
import { buttonStyles } from "@/components/ui/button";

interface ScanToSellProps {
  /** Called once a scan/photo/search resolves to a real product (existing stock, or a just quick-added one) — the caller owns the running tally. */
  onAddProduct: (product: Product) => void;
}

/**
 * One tap switches between the two ways of finding the next item. "Scan"
 * is a single camera view that does double duty — barcode auto-detection
 * runs continuously in the background, and a shutter button (owned by
 * `BarcodeScanner` itself) captures a photo for Gemma identification
 * without ever leaving that view or handing off to a separate screen.
 */
type Mode = "scan" | "search";

type QuickAddOrigin = "barcode" | "photo";

/** Sits on top of whichever mode is active without replacing it, so the camera underneath never has to be re-acquired between items — see `handleDetect`'s doc comment for why that mattered. */
type Overlay =
  | { kind: "none" }
  | { kind: "resolving" }
  | { kind: "photoIdentifying" }
  | {
      kind: "quickAdd";
      origin: QuickAddOrigin;
      barcode?: string;
      name: string;
      category: string;
      priceKES?: number;
    };

interface BarcodeLookupResponse {
  found: boolean;
  name?: string;
  category?: string;
}

/** A camera scan or photo resolved to nothing sellable yet — the shopkeeper fills these two fields and it's added straight to the sale. Never a full inventory form (PRD's "as simple as possible" — barcode/category ride along silently). */
async function quickAddProduct(
  overlay: Extract<Overlay, { kind: "quickAdd" }>,
  name: string,
  priceKES: number,
): Promise<Product> {
  return addProduct({
    name,
    category: overlay.category || "General",
    barcode: overlay.barcode,
    priceKES,
    stockQty: 0,
    source: overlay.origin,
    available: true,
  });
}

/**
 * The supermarket-cashier item-finding loop for the sell page: Scan and
 * Search are two always-visible tabs (one tap between them), each funneling
 * into the same resolution pipeline so the sell page itself only ever sees
 * finished `Product`s via `onAddProduct`. Scan mode is itself a single
 * camera view with three ways to resolve an item, not three separate
 * screens — barcode auto-detection and the photo shutter share one live
 * stream (see `BarcodeScanner`):
 *
 * 1. Barcode already in this shop's stock (`getProductByBarcode`) — instant.
 * 2. Barcode not in stock — `/api/barcode-lookup` (Open Food Facts, then
 *    UPCitemdb) suggests a name; the shopkeeper only has to confirm a price
 *    (pre-filled when the source already supplied one).
 * 3. No barcode readable — a typed barcode number, or the shutter button's
 *    photo through Gemma (`/api/identify-product`), either matches an
 *    existing product by name (`matchProductByName`) or seeds the same
 *    quick-add price prompt — pre-filled with Gemma's own price estimate
 *    when it has one, so a visible price tag in the photo means the
 *    shopkeeper often doesn't have to type a price at all.
 */
export function ScanToSell({ onAddProduct }: ScanToSellProps) {
  const t = useTranslations("scanSell");
  const [mode, setMode] = useState<Mode>("scan");
  const [overlay, setOverlayState] = useState<Overlay>({ kind: "none" });
  const [manualBarcodeOpen, setManualBarcodeOpen] = useState(false);
  const [justAdded, setJustAdded] = useState<{ name: string; at: number } | null>(null);

  // `handleDetect` below must never change identity, or BarcodeScanner's
  // camera-acquire effect (keyed on `onDetect`) tears the stream down and
  // re-requests it — which is exactly what made scanning several items in
  // a row feel slow (a real shopkeeper complaint). Reading "is an overlay
  // already open" through a ref, not the `overlay` state value directly,
  // is what lets `handleDetect` stay a `useCallback(..., [])` — see also
  // `onAddProductRef` for the same reasoning applied to the caller's prop.
  const overlayRef = useRef<Overlay>({ kind: "none" });
  const onAddProductRef = useRef(onAddProduct);
  useEffect(() => {
    onAddProductRef.current = onAddProduct;
  });

  function setOverlay(next: Overlay) {
    overlayRef.current = next;
    setOverlayState(next);
  }

  useEffect(() => {
    if (!justAdded) {
      return;
    }
    const timeout = setTimeout(() => setJustAdded(null), 1800);
    return () => clearTimeout(timeout);
  }, [justAdded]);

  const confirmAdded = useCallback((product: Product) => {
    onAddProductRef.current(product);
    setJustAdded({ name: product.name, at: Date.now() });
    setOverlay({ kind: "none" });
  }, []);

  const handleDetect = useCallback(
    async (barcode: string) => {
      if (overlayRef.current.kind !== "none") {
        return; // A resolution is already in progress — ignore a stray re-detection.
      }

      const stocked = await getProductByBarcode(barcode);
      if (stocked) {
        confirmAdded(stocked);
        return;
      }

      setOverlay({ kind: "resolving" });
      try {
        const response = await fetch(`/api/barcode-lookup?code=${encodeURIComponent(barcode)}`);
        const body = (await response.json()) as BarcodeLookupResponse;
        if (response.ok && body.found) {
          setOverlay({ kind: "quickAdd", origin: "barcode", barcode, name: body.name!, category: body.category! });
          return;
        }
      } catch {
        // Provider(s) unreachable — falls through to the same quick-add prompt as a clean miss.
      }
      setOverlay({ kind: "quickAdd", origin: "barcode", barcode, name: "", category: "General" });
    },
    [confirmAdded],
  );

  const handlePhoto = useCallback(
    async (photo: Blob) => {
      setOverlay({ kind: "photoIdentifying" });
      const formData = new FormData();
      formData.append("image", photo, "photo.jpg");

      try {
        const response = await fetch("/api/identify-product", { method: "POST", body: formData });
        if (!response.ok) {
          throw new Error("identify failed");
        }
        const guess = (await response.json()) as ProductGuess;
        const match = matchProductByName(guess.name, await listProducts());
        if (match) {
          confirmAdded(match);
          return;
        }
        setOverlay({
          kind: "quickAdd",
          origin: "photo",
          name: guess.name,
          category: guess.category,
          // Gemma's own estimate doubles as "the price tag in this photo
          // said X" when it has a real read on one — the shopkeeper only
          // needs to type a price when there was nothing to read.
          priceKES: guess.estimatedPriceKES > 0 ? guess.estimatedPriceKES : undefined,
        });
      } catch {
        setOverlay({ kind: "quickAdd", origin: "photo", name: "", category: "General" });
      }
    },
    [confirmAdded],
  );

  function switchMode(next: Mode) {
    setMode(next);
    setOverlay({ kind: "none" });
    setManualBarcodeOpen(false);
  }

  const modeTabs: { mode: Mode; label: string; icon: typeof ScanBarcode }[] = [
    { mode: "scan", label: t("modeScan"), icon: ScanBarcode },
    { mode: "search", label: t("modeSearch"), icon: Search },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        {modeTabs.map(({ mode: tabMode, label, icon: Icon }) => (
          <button
            key={tabMode}
            type="button"
            onClick={() => switchMode(tabMode)}
            aria-pressed={mode === tabMode}
            className={`flex items-center justify-center gap-1.5 rounded-2xl border px-3 py-3 text-sm font-medium transition-colors ${
              mode === tabMode
                ? "border-green-600 bg-green-600/10 text-green-500"
                : "border-zinc-800 text-zinc-400"
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {mode === "scan" && (
        <div className="flex flex-col items-center gap-3">
          <div className="relative w-full">
            <BarcodeScanner
              onDetect={handleDetect}
              onCapturePhoto={handlePhoto}
              onManualEntry={() => switchMode("search")}
            />
            {overlay.kind !== "none" && (
              <div className="absolute inset-0 flex items-center justify-center rounded-3xl bg-black/85 p-4">
                <OverlayContent
                  overlay={overlay}
                  onAdd={confirmAdded}
                  onCancel={() => setOverlay({ kind: "none" })}
                  t={t}
                />
              </div>
            )}
          </div>
          {manualBarcodeOpen ? (
            <ManualBarcodeForm
              onSubmit={(code) => {
                setManualBarcodeOpen(false);
                void handleDetect(code);
              }}
              onCancel={() => setManualBarcodeOpen(false)}
              t={t}
            />
          ) : (
            <button
              type="button"
              onClick={() => setManualBarcodeOpen(true)}
              className="flex items-center gap-1.5 py-1.5 text-sm font-medium text-zinc-400 underline underline-offset-2"
            >
              <Keyboard size={14} />
              {t("typeBarcodeButton")}
            </button>
          )}
        </div>
      )}

      {mode === "search" && <ProductPicker onSelect={confirmAdded} />}

      {justAdded && (
        <p role="status" className="flex items-center gap-1.5 text-sm font-medium text-green-500">
          <CheckCircle2 size={16} />
          {t("addedMessage", { name: justAdded.name })}
        </p>
      )}
    </div>
  );
}

function OverlayContent({
  overlay,
  onAdd,
  onCancel,
  t,
}: {
  overlay: Overlay;
  onAdd: (product: Product) => void;
  onCancel: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  if (overlay.kind === "none") {
    return null;
  }

  if (overlay.kind === "resolving") {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <Loader2 size={24} className="animate-spin text-green-500" />
        <p className="text-sm text-zinc-300">{t("lookingUp")}</p>
      </div>
    );
  }

  if (overlay.kind === "photoIdentifying") {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <Loader2 size={24} className="animate-spin text-green-500" />
        <p className="text-sm text-zinc-300">{t("identifyingPhoto")}</p>
      </div>
    );
  }

  return <QuickAddCard overlay={overlay} onAdd={onAdd} onCancel={onCancel} t={t} />;
}

function QuickAddCard({
  overlay,
  onAdd,
  onCancel,
  t,
}: {
  overlay: Extract<Overlay, { kind: "quickAdd" }>;
  onAdd: (product: Product) => void;
  onCancel: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const [name, setName] = useState(overlay.name);
  const [price, setPrice] = useState(overlay.priceKES !== undefined ? String(overlay.priceKES) : "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError(t("nameRequired"));
      return;
    }
    if (!/^\d+$/.test(price.trim())) {
      setError(t("priceInvalid"));
      return;
    }

    setError(null);
    setSaving(true);
    const product = await quickAddProduct(overlay, name.trim(), Number(price.trim()));
    onAdd(product);
  }

  return (
    <Card variant="light" className="w-full max-w-sm px-6 py-8">
      <p className="mb-4 text-sm font-medium text-zinc-600">
        {overlay.name ? t("foundTitle", { name: overlay.name }) : t("newProductTitle")}
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
        <label className="flex flex-col gap-1.5 text-left text-sm font-medium text-zinc-700">
          {t("nameLabel")}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-3 text-base text-zinc-900 outline-none focus:border-green-600 focus:bg-white"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-left text-sm font-medium text-zinc-700">
          {t("priceLabel")}
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            inputMode="numeric"
            className="rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-3 text-base text-zinc-900 outline-none focus:border-green-600 focus:bg-white"
          />
        </label>
        {overlay.priceKES !== undefined && (
          <p className="text-xs text-zinc-500">{t("priceFromPhotoHint")}</p>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <button type="submit" disabled={saving} className={buttonStyles("primary", "lg", "mt-1 w-full")}>
          {t("addToSaleButton")}
        </button>
        <button type="button" onClick={onCancel} className="py-1.5 text-sm text-zinc-500 underline underline-offset-2">
          {t("cancelButton")}
        </button>
      </form>
    </Card>
  );
}

function ManualBarcodeForm({
  onSubmit,
  onCancel,
  t,
}: {
  onSubmit: (code: string) => void;
  onCancel: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!/^\d+$/.test(code.trim())) {
      setError(t("manualBarcodeInvalid"));
      return;
    }
    onSubmit(code.trim());
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-2">
      <label className="flex flex-col gap-1.5 text-left text-sm font-medium text-zinc-300">
        {t("manualBarcodeLabel")}
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          inputMode="numeric"
          autoFocus
          className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-3.5 py-3 text-base text-zinc-100 outline-none focus:border-green-600"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" className={buttonStyles("primary", "md", "flex-1")}>
          {t("manualBarcodeSubmit")}
        </button>
        <button type="button" onClick={onCancel} className="py-1.5 text-sm text-zinc-500 underline underline-offset-2">
          {t("cancelButton")}
        </button>
      </div>
    </form>
  );
}
