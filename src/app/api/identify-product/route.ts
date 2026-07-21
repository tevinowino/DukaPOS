import { NextResponse } from "next/server";
import { identifyProduct } from "@/lib/ai/gemmaClient";
import { AiIdentifyError } from "@/lib/ai/types";

/** Generous headroom over compressed-photo size (client compresses to ~768px JPEG — see src/lib/media/compressImage.ts) — this is a hard ceiling against abuse, not the expected size. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** PRD §6's 2–6s target plus generous headroom for real-world network/provider variance. */
const REQUEST_TIMEOUT_MS = 15_000;

function timeoutRejection(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new AiIdentifyError("Gemma request timed out")), ms);
  });
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const image = formData.get("image");

  if (!(image instanceof Blob)) {
    return NextResponse.json({ error: "Missing image" }, { status: 400 });
  }
  if (!ALLOWED_MIME_TYPES.has(image.type)) {
    return NextResponse.json({ error: "Unsupported image type" }, { status: 400 });
  }
  if (image.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "Image too large" }, { status: 400 });
  }

  const imageBytes = new Uint8Array(await image.arrayBuffer());

  try {
    const guess = await Promise.race([
      identifyProduct(imageBytes, image.type),
      timeoutRejection(REQUEST_TIMEOUT_MS),
    ]);
    return NextResponse.json(guess);
  } catch (error) {
    console.warn("/api/identify-product: identification failed", error);
    const message =
      error instanceof AiIdentifyError ? error.message : "Couldn't identify this product";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
