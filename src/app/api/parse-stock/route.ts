import { NextResponse } from "next/server";
import { parseStockUpdate } from "@/lib/ai/gemmaClient";
import { AiTextError } from "@/lib/ai/types";
import type { Product } from "@/lib/db/schema";

/** Comfortably above any real stock-update sentence, well below an absurd/abusive payload. */
const MAX_TEXT_LENGTH = 500;

interface ParseStockRequestBody {
  text: string;
  /**
   * The shop's current products, sent by the client — this route runs
   * server-side and has no access to the browser's IndexedDB (same
   * reasoning as `/api/sync`; there's no server session per ADR-2 to look
   * this up any other way).
   */
  existingProducts: Product[];
}

export async function POST(request: Request) {
  const body = (await request.json()) as ParseStockRequestBody;
  const text = body.text?.trim() ?? "";

  if (!text) {
    return NextResponse.json({ error: "Text is required" }, { status: 400 });
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return NextResponse.json({ error: "Text is too long" }, { status: 400 });
  }

  try {
    const updates = await parseStockUpdate(text, body.existingProducts ?? []);
    return NextResponse.json({ updates });
  } catch (error) {
    console.warn("/api/parse-stock: parsing failed", error);
    const message = error instanceof AiTextError ? error.message : "Couldn't parse this update";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
