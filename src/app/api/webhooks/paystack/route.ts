import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { fetchMutation } from "convex/nextjs";
import { api } from "@convex/_generated/api";

/**
 * Verified live against Paystack's own docs (this phase's overview.md):
 * HMAC-SHA512 of the raw JSON body, hex-encoded, keyed by
 * `PAYSTACK_SECRET_KEY`. Must run against the exact raw bytes Paystack
 * sent — re-serializing the parsed JSON before hashing can produce a
 * different signature (differing whitespace/key order), which is exactly
 * why this route reads `request.text()` before any `JSON.parse`.
 */
function isValidSignature(rawBody: string, signatureHeader: string | null, secretKey: string): boolean {
  if (!signatureHeader) {
    return false;
  }
  const expected = createHmac("sha512", secretKey).update(rawBody).digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const signatureBuffer = Buffer.from(signatureHeader, "utf8");
  if (expectedBuffer.length !== signatureBuffer.length) {
    return false;
  }
  return timingSafeEqual(expectedBuffer, signatureBuffer);
}

interface PaystackWebhookPayload {
  event: string;
  data?: {
    reference?: string;
    /** Passed through from the charge request — see paystackClient.ts's doc comment on why `shopId` has to travel this way. */
    metadata?: { shopId?: string };
  };
}

export async function POST(request: Request) {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  const rawBody = await request.text();
  const signatureHeader = request.headers.get("x-paystack-signature");

  if (!secretKey || !isValidSignature(rawBody, signatureHeader, secretKey)) {
    // Never log the payload itself here (global-rules §7) — an invalid
    // signature means it isn't trusted, so it isn't parsed or acted on.
    console.warn("/api/webhooks/paystack: signature verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: PaystackWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch (error) {
    console.warn("/api/webhooks/paystack: signature-valid payload was not valid JSON", error);
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  // "charge.success" is the only charge-completion event this project
  // handles — verified against Paystack's webhook events documentation
  // (this phase's overview.md). Any other event (including other charge
  // lifecycle events) is acknowledged but ignored; Paystack only needs a
  // 200 to stop retrying.
  if (payload.event === "charge.success") {
    const reference = payload.data?.reference;
    const shopId = payload.data?.metadata?.shopId;
    if (reference && shopId) {
      await fetchMutation(api.transactions.markCompleted, { shopId, reference });
    } else {
      console.warn("/api/webhooks/paystack: charge.success missing reference or shopId metadata");
    }
  }

  return NextResponse.json({ received: true });
}
