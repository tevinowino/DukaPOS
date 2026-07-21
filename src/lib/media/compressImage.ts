/**
 * Longest edge a compressed photo is scaled down to before upload. Chosen
 * to keep the AI vision call's request body small (matters for both the
 * 2–6s photo-ID latency target and users on limited data plans, per PRD
 * §6) while staying large enough for the model to make out product
 * packaging/labels.
 */
const MAX_DIMENSION_PX = 768;

/** JPEG quality (0–1). 0.7 is a standard "visually near-lossless, meaningfully smaller" tradeoff point. */
const JPEG_QUALITY = 0.7;

/**
 * Downscales and re-encodes an image file as a bounded-size JPEG blob,
 * client-side, before it's ever sent over the network.
 */
export async function compressImage(file: File | Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION_PX / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas 2D context unavailable");
  }
  context.drawImage(bitmap, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Image compression failed"))),
      "image/jpeg",
      JPEG_QUALITY,
    );
  });
}
