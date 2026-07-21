"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { IScannerControls } from "@zxing/browser";

interface BarcodeScannerProps {
  onDetect: (barcode: string) => void;
  onManualEntry: () => void;
}

type ScannerState = "starting" | "scanning" | "permissionDenied";

const BARCODE_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"];

/** Same code fired again within this window is treated as a held-steady read, not a new scan. */
const REDETECT_COOLDOWN_MS = 2000;

/**
 * Camera-based barcode scanner. One `getUserMedia` call acquires the
 * stream; `BarcodeDetector` reads it directly if the browser supports it
 * (Chrome/Edge/Android — not Safari/Firefox), otherwise `@zxing/browser`
 * reads the same stream via its `decodeFromStream`. Fires `onDetect` once
 * per held barcode, not dozens of times per second.
 */
export function BarcodeScanner({ onDetect, onManualEntry }: BarcodeScannerProps) {
  const t = useTranslations("scanner");
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<ScannerState>("starting");
  const lastDetection = useRef<{ code: string; at: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let rafId: number | null = null;
    let zxingControls: IScannerControls | null = null;

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
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
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
          video: { facingMode: "environment" },
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
    };
  }, [onDetect]);

  if (state === "permissionDenied") {
    return (
      <div className="flex flex-col items-center gap-3 p-6 text-center">
        <p role="alert" className="text-sm text-red-600">
          {t("permissionDenied")}
        </p>
        <button
          type="button"
          onClick={onManualEntry}
          className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          {t("enterManually")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <video ref={videoRef} muted playsInline className="w-full rounded bg-black" />
      {state === "starting" && <p className="text-sm text-zinc-500">{t("starting")}</p>}
      <button type="button" onClick={onManualEntry} className="text-sm underline">
        {t("enterManuallyInstead")}
      </button>
    </div>
  );
}
