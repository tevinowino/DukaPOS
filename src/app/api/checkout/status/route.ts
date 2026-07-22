import { NextResponse } from "next/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@convex/_generated/api";

/**
 * The ADR-3 poll target: the checkout waiting screen calls this every few
 * seconds while a payment is in flight, since a server-side webhook can't
 * reach into this device's IndexedDB directly to tell it a payment
 * completed. A stateless GET with no side effects — safe to call from
 * multiple tabs/polls concurrently (global-rules §5.2/§6).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const shopId = searchParams.get("shopId");
  const reference = searchParams.get("reference");

  if (!shopId || !reference) {
    return NextResponse.json({ error: "shopId and reference are required" }, { status: 400 });
  }

  const transaction = await fetchQuery(api.transactions.getByReference, { shopId, reference });
  if (!transaction) {
    return NextResponse.json({ error: "Unknown reference" }, { status: 404 });
  }

  return NextResponse.json({ status: transaction.status });
}
