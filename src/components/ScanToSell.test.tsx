import { useEffect } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db/schema";
import { addProduct, getProductByBarcode } from "@/lib/db/products";
import type { Product } from "@/lib/db/schema";
import { ScanToSell } from "./ScanToSell";

let capturedOnDetect: ((barcode: string) => void) | undefined;
let capturedOnManualEntry: (() => void) | undefined;
let capturedOnCapturePhoto: ((photo: Blob) => void) | undefined;
let barcodeScannerMountCount = 0;
vi.mock("@/components/BarcodeScanner", () => ({
  BarcodeScanner: ({
    onDetect,
    onManualEntry,
    onCapturePhoto,
  }: {
    onDetect: (barcode: string) => void;
    onManualEntry: () => void;
    onCapturePhoto: (photo: Blob) => void;
  }) => {
    capturedOnDetect = onDetect;
    capturedOnManualEntry = onManualEntry;
    capturedOnCapturePhoto = onCapturePhoto;
    // Deliberately mount-only (empty deps), not per-render — this is the
    // thing ScanToSell.tsx's whole architecture exists to protect: the
    // camera-acquiring effect inside the real BarcodeScanner must not
    // re-run every time a scan resolves, or scanning several items in a
    // row would keep re-requesting the camera stream (see the "speed"
    // regression this was fixed for).
    useEffect(() => {
      barcodeScannerMountCount += 1;
    }, []);
    return <div data-testid="mock-barcode-scanner" />;
  },
}));

let capturedOnSelect: ((product: Product) => void) | undefined;
vi.mock("@/components/ProductPicker", () => ({
  ProductPicker: ({ onSelect }: { onSelect: (product: Product) => void }) => {
    capturedOnSelect = onSelect;
    return <div data-testid="mock-product-picker" />;
  },
}));

const messages = {
  scanSell: {
    modeScan: "Scan",
    modeSearch: "Search",
    addedMessage: "Added {name}",
    typeBarcodeButton: "Can't scan it? Type the number",
    manualBarcodeLabel: "Barcode number",
    manualBarcodeSubmit: "Look up",
    manualBarcodeInvalid: "Barcode should be numbers only",
    lookingUp: "Not in your stock yet — checking product databases…",
    identifyingPhoto: "Identifying the product…",
    foundTitle: "Found: {name}",
    newProductTitle: "New product — not in your stock yet",
    nameLabel: "Product name",
    priceLabel: "Selling price (KES)",
    priceFromPhotoHint: "Price read from the photo — check it's correct",
    nameRequired: "Enter a product name",
    priceInvalid: "Enter a valid price (whole KES, 0 or more)",
    addToSaleButton: "Add to sale",
    cancelButton: "Cancel",
  },
};

function renderScanToSell(onAddProduct = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ScanToSell onAddProduct={onAddProduct} />
    </NextIntlClientProvider>,
  );
  return { onAddProduct };
}

describe("ScanToSell", () => {
  beforeEach(async () => {
    await db.products.clear();
    capturedOnDetect = undefined;
    capturedOnManualEntry = undefined;
    capturedOnCapturePhoto = undefined;
    capturedOnSelect = undefined;
    barcodeScannerMountCount = 0;
    vi.restoreAllMocks();
  });

  it("adds a product already in local stock straight to the tally, with no network call", async () => {
    const stocked = await addProduct({
      name: "Red Bull 250ml",
      category: "Drinks",
      barcode: "9002490100070",
      priceKES: 150,
      stockQty: 10,
      source: "barcode",
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { onAddProduct } = renderScanToSell();

    await act(async () => {
      await capturedOnDetect!("9002490100070");
    });

    expect(onAddProduct).toHaveBeenCalledWith(stocked);
    expect(await screen.findByText("Added Red Bull 250ml")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows a name-prefilled quick-add card when the barcode isn't stocked but a lookup provider finds it, then adds it to the tally and stock on submit", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ found: true, barcode: "5449000000996", name: "Coca-Cola", category: "Colas" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const { onAddProduct } = renderScanToSell();

    await act(async () => {
      await capturedOnDetect!("5449000000996");
    });

    expect(await screen.findByText("Found: Coca-Cola")).toBeInTheDocument();
    const nameInput = screen.getByLabelText("Product name");
    expect(nameInput).toHaveValue("Coca-Cola");

    await user.type(screen.getByLabelText("Selling price (KES)"), "120");
    await user.click(screen.getByRole("button", { name: "Add to sale" }));

    await waitFor(() => expect(onAddProduct).toHaveBeenCalledTimes(1));
    const addedProduct = onAddProduct.mock.calls[0][0];
    expect(addedProduct).toMatchObject({
      name: "Coca-Cola",
      category: "Colas",
      barcode: "5449000000996",
      priceKES: 120,
      stockQty: 0,
      source: "barcode",
      available: true,
    });
    expect(await getProductByBarcode("5449000000996")).toMatchObject({ name: "Coca-Cola", priceKES: 120 });
  });

  it("shows a blank quick-add card when no provider recognizes the barcode, and requires a typed name before adding", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ found: false }) }));
    const user = userEvent.setup();
    const { onAddProduct } = renderScanToSell();

    await act(async () => {
      await capturedOnDetect!("0000000000000");
    });

    expect(await screen.findByText("New product — not in your stock yet")).toBeInTheDocument();
    expect(screen.getByLabelText("Product name")).toHaveValue("");

    await user.click(screen.getByRole("button", { name: "Add to sale" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter a product name");
    expect(onAddProduct).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Product name"), "Matchbox");
    await user.type(screen.getByLabelText("Selling price (KES)"), "10");
    await user.click(screen.getByRole("button", { name: "Add to sale" }));

    await waitFor(() => expect(onAddProduct).toHaveBeenCalledTimes(1));
    expect(onAddProduct.mock.calls[0][0]).toMatchObject({
      name: "Matchbox",
      barcode: "0000000000000",
      priceKES: 10,
      source: "barcode",
    });
  });

  it("never re-mounts the camera across two full resolve cycles in barcode mode — the fix for scanning several items feeling slow", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ found: false }) }));
    const user = userEvent.setup();
    renderScanToSell();
    expect(barcodeScannerMountCount).toBe(1);
    // The real BarcodeScanner's camera-acquire effect is keyed on
    // `onDetect`'s identity (not just mount/unmount) — proving this
    // reference never changes across a resolve cycle is what actually
    // guarantees the real camera stream is never torn down and
    // re-requested, which is the mock's own `useEffect(..., [])` above
    // can't observe by itself.
    const onDetectBeforeCycle = capturedOnDetect;

    await act(async () => {
      await capturedOnDetect!("1111111111111");
    });
    await user.type(screen.getByLabelText("Product name"), "Matchbox");
    await user.type(screen.getByLabelText("Selling price (KES)"), "10");
    await user.click(screen.getByRole("button", { name: "Add to sale" }));
    await waitFor(() => expect(screen.getByTestId("mock-barcode-scanner")).toBeInTheDocument());

    await act(async () => {
      await capturedOnDetect!("2222222222222");
    });
    // A generous timeout (not the 1000ms default): this assertion follows
    // two full resolve cycles including real userEvent typing, and under a
    // loaded CI/sandbox machine the default budget is tight enough to flake
    // even though the underlying `act()` above already awaited every state
    // update — this widens the poll window without weakening the assertion.
    expect(await screen.findByText("New product — not in your stock yet", {}, { timeout: 5000 })).toBeInTheDocument();

    expect(barcodeScannerMountCount).toBe(1);
    expect(capturedOnDetect).toBe(onDetectBeforeCycle);
  });

  it("ignores a stray detection while a quick-add card is already open, instead of starting a second resolution", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ found: false }) }));
    renderScanToSell();

    await act(async () => {
      await capturedOnDetect!("1111111111111");
    });
    await screen.findByText("New product — not in your stock yet");

    await act(async () => {
      await capturedOnDetect!("2222222222222");
    });

    // Still showing the first barcode's card — a second one never opened.
    expect(screen.getByLabelText("Product name")).toHaveValue("");
    expect(screen.getAllByText("New product — not in your stock yet")).toHaveLength(1);
  });

  it("looks up a typed barcode number through the same pipeline as a camera detection", async () => {
    const stocked = await addProduct({
      name: "Rice 2kg",
      category: "Groceries",
      barcode: "6161100009999",
      priceKES: 220,
      stockQty: 15,
      source: "barcode",
    });
    const user = userEvent.setup();
    const { onAddProduct } = renderScanToSell();

    await user.click(screen.getByRole("button", { name: "Can't scan it? Type the number" }));
    await user.type(screen.getByLabelText("Barcode number"), "6161100009999");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    await waitFor(() => expect(onAddProduct).toHaveBeenCalledWith(stocked));
  });

  it("rejects a non-numeric typed barcode without attempting a lookup", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderScanToSell();

    await user.click(screen.getByRole("button", { name: "Can't scan it? Type the number" }));
    await user.type(screen.getByLabelText("Barcode number"), "abc123");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Barcode should be numbers only");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("matches a photo guess to an existing stocked product and adds it directly, without showing the quick-add card", async () => {
    // The shutter button lives inside the same Scan tab as barcode
    // detection (BarcodeScanner.onCapturePhoto) — no separate Photo tab to
    // switch to first, matching the "barcode and photo as one camera view" design.
    const stocked = await addProduct({
      name: "Blueband Margarine 500g",
      category: "Groceries",
      priceKES: 320,
      stockQty: 4,
      source: "manual",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ name: "Blueband Margarine", category: "Groceries", estimatedPriceKES: 300 }),
      }),
    );
    const { onAddProduct } = renderScanToSell();

    await act(async () => {
      await capturedOnCapturePhoto!(new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }));
    });

    expect(onAddProduct).toHaveBeenCalledWith(stocked);
    expect(await screen.findByText("Added Blueband Margarine 500g")).toBeInTheDocument();
  });

  it("pre-fills the price from Gemma's estimate when a photo of an unmatched product shows one, so the shopkeeper often doesn't have to type it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ name: "Imported Chocolate Bar", category: "Snacks", estimatedPriceKES: 250 }),
      }),
    );
    renderScanToSell();

    await act(async () => {
      await capturedOnCapturePhoto!(new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }));
    });

    expect(await screen.findByLabelText("Selling price (KES)")).toHaveValue("250");
    expect(screen.getByText("Price read from the photo — check it's correct")).toBeInTheDocument();
  });

  it("switches to Search mode and adds whatever ProductPicker selects", async () => {
    const product = await addProduct({
      name: "Sugar 1kg",
      category: "Groceries",
      priceKES: 100,
      stockQty: 10,
      source: "manual",
    });
    const user = userEvent.setup();
    const { onAddProduct } = renderScanToSell();

    await user.click(screen.getByRole("button", { name: "Search" }));
    expect(screen.getByTestId("mock-product-picker")).toBeInTheDocument();
    expect(screen.queryByTestId("mock-barcode-scanner")).not.toBeInTheDocument();

    act(() => capturedOnSelect!(product));

    expect(onAddProduct).toHaveBeenCalledWith(product);
  });

  it("switches to Search mode when BarcodeScanner reports the camera is unusable", async () => {
    renderScanToSell();

    act(() => capturedOnManualEntry!());

    expect(screen.getByTestId("mock-product-picker")).toBeInTheDocument();
  });
});
