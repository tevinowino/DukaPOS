"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Camera } from "lucide-react";
import type { IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { compressImage } from "@/lib/media/compressImage";

interface BarcodeScannerProps {
  onDetect: (barcode: string) => void;
  onManualEntry: () => void;
  /**
   * When provided, barcode scanning and photo capture become one camera
   * view instead of two separate flows (a shopkeeper shouldn't have to
   * leave the live preview and hand off to a native camera app just
   * because one item happens to have no barcode) — a shutter button
   * appears over the video and this fires with the current frame,
   * compressed the same way `PhotoCapture`'s file-based path is. Omitted
   * by callers (like the add-product barcode flow) that already have
   * their own separate photo entry point.
   */
  onCapturePhoto?: (photo: Blob) => void;
}

type ScannerState = "starting" | "scanning" | "permissionDenied";

const BARCODE_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"];

/** Same set as `BARCODE_FORMATS`, in @zxing/library's own enum — see `scanWithZxing`'s hints for why this matters beyond just consistency. */
const ZXING_FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.QR_CODE,
];

/** Same code fired again within this window is treated as a held-steady read, not a new scan. */
const REDETECT_COOLDOWN_MS = 2000;

/**
 * @zxing/library 0.23.0's `MultiFormatReader.decodeInternal` has a real
 * bug (verified by reading its source): it only silences exceptions that
 * are `instanceof ReaderException`, but `NotFoundException` and
 * `ChecksumException` — the two exceptions thrown on every single frame
 * where no barcode is found — both extend `Exception` directly, not
 * `ReaderException`. So this exact `console.warn` fires continuously
 * during completely normal scanning, not just on genuine failures, and
 * makes a working scanner look broken. There's no public API to
 * configure this away, so this suppresses only that one specific,
 * verified-benign message while the zxing decode loop is running —
 * every other `console.warn` call, from this component or anywhere else,
 * passes through untouched.
 */
const ZXING_NOISY_WARNING_PREFIX = "MultiFormatReader: non-ReaderException from reader:";

/**
 * A camera's default single-shot autofocus (locked once at stream start)
 * is often stale by the time a shopkeeper holds up their second or third
 * item — this is a real contributor to "scanning is slow/unreliable" for
 * close-up, small barcodes specifically. `focusMode` isn't in TypeScript's
 * DOM lib yet, but is widely supported on Chrome/Android; every step here
 * is defensive (`getCapabilities` may not exist, the device may not offer
 * `"continuous"`, `applyConstraints` may reject) since this is a pure
 * best-effort enhancement — a device that doesn't support it just keeps
 * whatever focus behavior it already had.
 */
async function enableContinuousFocusIfSupported(stream: MediaStream): Promise<void> {
  const track = stream.getVideoTracks()[0];
  if (!track || typeof track.getCapabilities !== "function") {
    return;
  }
  try {
    const capabilities = track.getCapabilities() as MediaTrackCapabilities & { focusMode?: string[] };
    if (!capabilities.focusMode?.includes("continuous")) {
      return;
    }
    await track.applyConstraints({
      advanced: [{ focusMode: "continuous" } as unknown as MediaTrackConstraintSet],
    });
  } catch {
    // Best-effort only.
  }
}

/**
 * Grabs the video element's current frame as a JPEG blob via an offscreen
 * canvas — the one place this component reads pixels out of the live
 * stream rather than just handing it to a barcode decoder.
 */
function captureVideoFrame(video: HTMLVideoElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      reject(new Error("Canvas 2D context unavailable"));
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Photo capture failed"))),
      "image/jpeg",
      0.92,
    );
  });
}

/**
 * Camera-based barcode scanner and photo-capture shutter, sharing one
 * `getUserMedia` stream. `BarcodeDetector` reads it directly if the
 * browser supports it (Chrome/Edge/Android — not Safari/Firefox),
 * otherwise `@zxing/browser` reads the same stream via its
 * `decodeFromStream`. Fires `onDetect` once per held barcode, not dozens
 * of times per second; fires `onCapturePhoto` once per shutter tap.
 */
export function BarcodeScanner({ onDetect, onManualEntry, onCapturePhoto }: BarcodeScannerProps) {
  const t = useTranslations("scanner");
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<ScannerState>("starting");
  const lastDetection = useRef<{ code: string; at: number } | null>(null);

  async function handleCapturePhoto() {
    const video = videoRef.current;
    if (!video || !onCapturePhoto) {
      return;
    }
    try {
      const frame = await captureVideoFrame(video);
      const compressed = await compressImage(frame);
      onCapturePhoto(compressed);
    } catch {
      // Best-effort — a failed grab just means the shopkeeper taps the shutter again.
    }
  }

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let rafId: number | null = null;
    let zxingControls: IScannerControls | null = null;
    let restoreConsoleWarn: (() => void) | null = null;

    function handleDetectedCode(code: string) {
      const now = Date.now();
      const last = lastDetection.current;
      if (last && last.code === code && now - last.at < REDETECT_COOLDOWN_MS) {
        return;
      }
      lastDetection.current = { code, at: now };
      onDetect(code);
    }

    async function scanWithBarcodeDetector(video: HTMLVideoElement) {
      const detector = new BarcodeDetector({ formats: BARCODE_FORMATS });
      const tick = async () => {
        if (cancelled) {
          return;
        }
        try {
          const detected = await detector.detect(video);
          if (detected.length > 0) {
            handleDetectedCode(detected[0].rawValue);
          }
        } catch {
          // Transient per-frame decode failures are expected; keep polling.
        }
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
    }

    async function scanWithZxing(video: HTMLVideoElement, mediaStream: MediaStream) {
      const originalWarn = console.warn.bind(console);
      console.warn = (...args: Parameters<typeof console.warn>) => {
        if (typeof args[0] === "string" && args[0].startsWith(ZXING_NOISY_WARNING_PREFIX)) {
          return;
        }
        originalWarn(...args);
      };
      restoreConsoleWarn = () => {
        console.warn = originalWarn;
      };

      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      // Restricting to the same formats the native BarcodeDetector path
      // uses isn't just for consistency: @zxing/library's default
      // (unrestricted) MultiFormatReader tries every format it knows —
      // including ones this app never uses, like Micro QR, Aztec, or PDF417
      // — on every single video frame. Narrowing POSSIBLE_FORMATS means
      // fewer decode attempts per frame (faster, more frames actually get
      // analyzed per second) and fewer false-positive checksum failures
      // from formats that were never going to match a retail barcode.
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, ZXING_FORMATS);
      // Small/damaged/skewed barcodes (a real shopkeeper complaint) are
      // exactly what TRY_HARDER exists for: it runs zxing's more thorough,
      // slower per-frame decode passes instead of bailing after the first
      // quick attempt. Restricting POSSIBLE_FORMATS above is what keeps
      // this affordable — trying harder across only 7 formats, not zxing's
      // full format list.
      hints.set(DecodeHintType.TRY_HARDER, true);
      const reader = new BrowserMultiFormatReader(hints);
      const controls = await reader.decodeFromStream(mediaStream, video, (result) => {
        if (result) {
          handleDetectedCode(result.getText());
        }
      });
      if (cancelled) {
        controls.stop();
        return;
      }
      zxingControls = controls;
    }

    async function start() {
      let mediaStream: MediaStream;
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          // `ideal` (not `exact`/`min`) so devices that can't hit this
          // resolution still fall back to their best available stream
          // instead of getUserMedia rejecting outright. A sharper image
          // gives both the native BarcodeDetector and the zxing fallback
          // more resolvable detail per barcode — low-resolution defaults
          // are a common real-world cause of unreliable detection, and
          // small barcodes in particular need every pixel of detail this
          // can get (bumped from 1280x720 after shopkeeper feedback that
          // small barcodes were hard to read).
          video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
      } catch {
        if (!cancelled) {
          setState("permissionDenied");
        }
        return;
      }

      if (cancelled) {
        mediaStream.getTracks().forEach((track) => track.stop());
        return;
      }
      stream = mediaStream;
      await enableContinuousFocusIfSupported(mediaStream);

      const video = videoRef.current;
      if (!video) {
        return;
      }
      video.srcObject = stream;
      await video.play();
      if (cancelled) {
        return;
      }
      setState("scanning");

      if (typeof window !== "undefined" && "BarcodeDetector" in window) {
        await scanWithBarcodeDetector(video);
      } else {
        await scanWithZxing(video, stream);
      }
    }

    start();

    return () => {
      cancelled = true;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      zxingControls?.stop();
      stream?.getTracks().forEach((track) => track.stop());
      restoreConsoleWarn?.();
    };
  }, [onDetect]);

  if (state === "permissionDenied") {
    return (
      <div className="flex flex-col items-center gap-3 p-6 text-center">
        <p role="alert" className="text-sm text-red-400">
          {t("permissionDenied")}
        </p>
        <button
          type="button"
          onClick={onManualEntry}
          className="rounded-2xl bg-green-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-500"
        >
          {t("enterManually")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      {/* A fixed aspect ratio (not width-only sizing) keeps this panel a
          predictable, mobile-friendly height regardless of what
          resolution/orientation the device's camera actually reports —
          real phones vary here, and `object-cover` crops to fill rather
          than distorting or leaving letterboxed bars. */}
      <div className="relative aspect-video w-full overflow-hidden rounded-3xl bg-black">
        <video ref={videoRef} muted playsInline className="absolute inset-0 h-full w-full object-cover" />
        {/* Viewfinder corner brackets — purely decorative framing, no functional role. */}
        <div className="pointer-events-none absolute inset-6 sm:inset-12">
          {[
            "top-0 left-0 border-t-4 border-l-4 rounded-tl-lg",
            "top-0 right-0 border-t-4 border-r-4 rounded-tr-lg",
            "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-lg",
            "bottom-0 right-0 border-b-4 border-r-4 rounded-br-lg",
          ].map((corner) => (
            <span key={corner} className={`absolute h-8 w-8 border-green-500 ${corner}`} />
          ))}
        </div>
        {state === "starting" && (
          <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-sm text-zinc-300">
            {t("starting")}
          </p>
        )}
        {state === "scanning" && onCapturePhoto && (
          <button
            type="button"
            onClick={handleCapturePhoto}
            aria-label={t("captureButtonLabel")}
            className="absolute bottom-4 left-1/2 flex h-16 w-16 -translate-x-1/2 items-center justify-center rounded-full border-4 border-white/80 bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/25 active:scale-95"
          >
            <Camera size={26} />
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={onManualEntry}
        className="py-1.5 text-sm font-medium text-zinc-400 underline underline-offset-2"
      >
        {t("enterManuallyInstead")}
      </button>
    </div>
  );
}
