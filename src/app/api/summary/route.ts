import { NextResponse } from "next/server";
import { generateSummary } from "@/lib/ai/gemmaClient";
import { AiTextError } from "@/lib/ai/types";
import type { Transaction } from "@/lib/db/schema";

interface SummaryRequestBody {
  /** The day's transactions, sent by the client — see `/api/parse-stock`'s note on why (no server-side Dexie access, no server session). */
  transactions: Transaction[];
  locale: string;
}

export async function POST(request: Request) {
  const body = (await request.json()) as SummaryRequestBody;

  try {
    const summary = await generateSummary({
      transactions: body.transactions ?? [],
      locale: body.locale ?? "en",
    });
    return NextResponse.json({ summary });
  } catch (error) {
    console.warn("/api/summary: generation failed", error);
    const message = error instanceof AiTextError ? error.message : "Couldn't generate a summary";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
