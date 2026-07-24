import { NextResponse } from "next/server";
import { lookupBarcode } from "@/lib/barcode/lookup";

/** Every format `BarcodeScanner` decodes (EAN/UPC/CODE128/CODE39/QR) stays within this — a loose bound against abuse, not a strict barcode-format validator (that's not this route's job). */
const VALID_CODE = /^[A-Za-z0-9-]{1,64}$/;

/** Kept server-side (like `/api/identify-product`) so the two providers' outbound calls never hit browser CORS, and any future provider API key stays off the client. */
export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code")?.trim() ?? "";

  if (!VALID_CODE.test(code)) {
    return NextResponse.json({ error: "Missing or invalid code" }, { status: 400 });
  }

  const result = await lookupBarcode(code);
  if (!result) {
    // A miss is a normal, expected outcome (most duka stock won't be in a
    // global product database) — not an error the client needs to catch specially.
    return NextResponse.json({ found: false });
  }

  return NextResponse.json({ found: true, ...result });
}
