"use client";

import { useTranslations } from "next-intl";
import { Camera } from "lucide-react";
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
      <label className="flex w-full max-w-sm cursor-pointer flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-zinc-700 px-6 py-10 text-center text-sm text-zinc-300 transition-colors hover:border-green-600">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-green-600/15 text-green-500">
          <Camera size={22} />
        </span>
        {t("takePhotoLabel")}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleChange}
          className="sr-only"
        />
      </label>
    </div>
  );
}
