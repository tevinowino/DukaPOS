"use client";

import { useTranslations } from "next-intl";
import { compressImage } from "@/lib/media/compressImage";

interface PhotoCaptureProps {
  onCapture: (file: Blob) => void;
}

/**
 * Native camera capture via a file input (ARCHITECTURE.md §4.1) —
 * `capture="environment"` prefers the rear camera on phones that support
 * it, and falls back to a normal file picker everywhere else. Every
 * selected photo is compressed client-side before `onCapture` fires.
 */
export function PhotoCapture({ onCapture }: PhotoCaptureProps) {
  const t = useTranslations("photoCapture");

  async function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const compressed = await compressImage(file);
    onCapture(compressed);
    event.target.value = "";
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <label className="flex flex-col gap-1 text-center text-sm">
        {t("takePhotoLabel")}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleChange}
          className="w-full max-w-sm text-sm"
        />
      </label>
    </div>
  );
}
