import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DecodeHintType, BarcodeFormat } from "@zxing/library";
import { BarcodeScanner } from "./BarcodeScanner";

const decodeFromStreamMock = vi.fn();
const stopMock = vi.fn();

vi.mock("@zxing/browser", () => ({
  BrowserMultiFormatReader: vi.fn().mockImplementation(function (
    this: { hints: unknown },
    hints: unknown,
  ) {
    this.hints = hints;
    // @ts-expect-error -- test double, not the real reader's prototype
    this.decodeFromStream = decodeFromStreamMock;
  }),
}));

const compressImageMock = vi.fn();
vi.mock("@/lib/media/compressImage", () => ({
  compressImage: (...args: unknown[]) => compressImageMock(...args),
}));

const messages = {
  scanner: {
    starting: "Starting camera…",
    permissionDenied: "Camera access was denied. You can still add this product manually.",
    enterManually: "Enter manually",
    enterManuallyInstead: "Enter manually instead",
    captureButtonLabel: "No barcode? Take a photo of this item",
  },
};

function renderScanner(
  onDetect = vi.fn(),
  onManualEntry = vi.fn(),
  onCapturePhoto?: (photo: Blob) => void,
) {
  const { unmount } = render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <BarcodeScanner onDetect={onDetect} onManualEntry={onManualEntry} onCapturePhoto={onCapturePhoto} />
    </NextIntlClientProvider>,
  );
  return { onDetect, onManualEntry, unmount };
}

describe("BarcodeScanner", () => {
  afterEach(() => {
    // @ts-expect-error -- test-only cleanup of a property this suite defines
    delete navigator.mediaDevices;
    // Not `vi.restoreAllMocks()`: that would also wipe the module-level
    // `BrowserMultiFormatReader` mock's constructor implementation (set
    // once, above, via `vi.mock`), breaking every test after the first.
    // Clear call history on just the specific mocks each test cares about.
    vi.spyOn(HTMLMediaElement.prototype, "play").mockRestore();
    vi.spyOn(console, "warn").mockRestore();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockRestore();
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockRestore();
    decodeFromStreamMock.mockClear();
    stopMock.mockClear();
    compressImageMock.mockReset();
  });

  function mockSuccessfulCamera() {
    // No `getCapabilities` (matches many real devices/browsers too) — the
    // continuous-focus enhancement must no-op rather than throw when it's
    // unavailable, which is exactly what this shape exercises.
    const track = { stop: stopMock };
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [track],
          getVideoTracks: () => [track],
        }),
      },
      configurable: true,
    });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  }

  it("restricts the zxing fallback reader to this app's retail barcode formats, and forwards a successful decode to onDetect", async () => {
    mockSuccessfulCamera();
    decodeFromStreamMock.mockResolvedValue({ stop: stopMock });
    const { onDetect } = renderScanner();

    await waitFor(() => expect(decodeFromStreamMock).toHaveBeenCalledTimes(1));

    const [, , resultCallback] = decodeFromStreamMock.mock.calls[0];

    const { BrowserMultiFormatReader } = await import("@zxing/browser");
    const constructorHints = vi.mocked(BrowserMultiFormatReader).mock.calls[0][0] as Map<
      DecodeHintType,
      BarcodeFormat[]
    >;
    expect(constructorHints.get(DecodeHintType.POSSIBLE_FORMATS)).toEqual([
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39,
      BarcodeFormat.QR_CODE,
    ]);
    // TRY_HARDER trades some CPU for zxing's more thorough decode passes —
    // real-world small/skewed barcodes often fail the fast-path attempt.
    expect(constructorHints.get(DecodeHintType.TRY_HARDER)).toBe(true);

    resultCallback({ getText: () => "6161100009999" });
    expect(onDetect).toHaveBeenCalledWith("6161100009999");
  });

  it("switches the camera track to continuous autofocus when the device advertises support for it", async () => {
    const applyConstraintsMock = vi.fn().mockResolvedValue(undefined);
    const track = {
      stop: stopMock,
      getCapabilities: () => ({ focusMode: ["manual", "continuous"] }),
      applyConstraints: applyConstraintsMock,
    };
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [track],
          getVideoTracks: () => [track],
        }),
      },
      configurable: true,
    });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    decodeFromStreamMock.mockResolvedValue({ stop: stopMock });

    renderScanner();

    await waitFor(() =>
      expect(applyConstraintsMock).toHaveBeenCalledWith({
        advanced: [{ focusMode: "continuous" }],
      }),
    );
  });

  it("suppresses only @zxing/library's known-noisy per-frame warning while scanning, leaving other warnings untouched", async () => {
    mockSuccessfulCamera();
    decodeFromStreamMock.mockResolvedValue({ stop: stopMock });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { unmount } = renderScanner();

    await waitFor(() => expect(decodeFromStreamMock).toHaveBeenCalledTimes(1));

    console.warn("MultiFormatReader: non-ReaderException from reader:", new Error("NotFoundException"));
    console.warn("some unrelated warning");

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith("some unrelated warning");

    // Unmounting restores the original console.warn — no lingering global patch.
    unmount();
    console.warn("MultiFormatReader: non-ReaderException from reader:", new Error("after unmount"));
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  it("shows no capture button at all when the caller doesn't provide onCapturePhoto (e.g. the add-product flow, which has its own separate photo entry point)", async () => {
    mockSuccessfulCamera();
    decodeFromStreamMock.mockResolvedValue({ stop: stopMock });
    renderScanner();

    await waitFor(() => expect(decodeFromStreamMock).toHaveBeenCalledTimes(1));

    expect(screen.queryByRole("button", { name: "No barcode? Take a photo of this item" })).not.toBeInTheDocument();
  });

  it("captures, compresses, and forwards the current video frame when the shutter button is tapped", async () => {
    mockSuccessfulCamera();
    decodeFromStreamMock.mockResolvedValue({ stop: stopMock });
    const rawFrameBlob = new Blob([new Uint8Array([1])], { type: "image/jpeg" });
    const compressedBlob = new Blob([new Uint8Array([2])], { type: "image/jpeg" });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (
      this: HTMLCanvasElement,
      callback: BlobCallback,
    ) {
      callback(rawFrameBlob);
    });
    compressImageMock.mockResolvedValue(compressedBlob);
    const onCapturePhoto = vi.fn();
    const user = userEvent.setup();
    renderScanner(vi.fn(), vi.fn(), onCapturePhoto);

    await waitFor(() => expect(decodeFromStreamMock).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: "No barcode? Take a photo of this item" }));

    expect(compressImageMock).toHaveBeenCalledWith(rawFrameBlob);
    await waitFor(() => expect(onCapturePhoto).toHaveBeenCalledWith(compressedBlob));
  });

  it("shows a permission-denied message and manual-entry affordance when getUserMedia rejects, without ever calling onDetect", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: vi.fn().mockRejectedValue(new Error("Permission denied")) },
      configurable: true,
    });

    const { onDetect } = renderScanner();

    expect(
      await screen.findByText(
        "Camera access was denied. You can still add this product manually.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enter manually" })).toBeInTheDocument();
    expect(onDetect).not.toHaveBeenCalled();
  });
});
