import { NextResponse } from "next/server";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "@convex/_generated/api";
import { PaystackChargeError, initiateMpesaCharge } from "@/lib/payments/paystackClient";

/**
 * Scoped to a single product line — see this phase's overview.md "Design
 * Decisions" for why M-Pesa checkout doesn't support Phase 4's multi-item
 * cart the way cash sales do (the Convex `markPending`/`markCompleted`
 * shape this plan specifies is inherently one-transaction-per-reference).
 */
interface CheckoutRequestBody {
  shopId: string;
  productId: string;
  quantity: number;
  /** Canonical E.164 phone with `+`, e.g. `"+254712345678"`. */
  phone: string;
}

export async function POST(request: Request) {
  const body = (await request.json()) as CheckoutRequestBody;

  if (!body.shopId || !body.productId || !body.phone || !(body.quantity >= 1)) {
    return NextResponse.json({ error: "Missing or invalid checkout details" }, { status: 400 });
  }

  // Recompute totalKES from Convex's synced product data — never from
  // anything the client might have sent, per global-rules §5.4. This
  // request body doesn't even have a price/amount field for that reason.
  const products = await fetchQuery(api.products.listByShop, { shopId: body.shopId });
  const product = products.find((candidate) => candidate.localId === body.productId);
  if (!product) {
    return NextResponse.json(
      {
        error:
          "This product hasn't synced yet — go online and let it sync before charging via M-Pesa",
      },
      { status: 409 },
    );
  }

  const totalKES = product.priceKES * body.quantity;
  const reference = crypto.randomUUID();

  let charge;
  try {
    charge = await initiateMpesaCharge({
      phone: body.phone,
      amountKES: totalKES,
      reference,
      shopId: body.shopId,
    });
  } catch (error) {
    console.warn("/api/checkout: Paystack charge failed", error);
    const message =
      error instanceof PaystackChargeError ? error.message : "Couldn't start the M-Pesa payment";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  await fetchMutation(api.transactions.markPending, {
    shopId: body.shopId,
    localId: reference,
    productId: product.localId,
    productName: product.name,
    quantity: body.quantity,
    totalKES,
    saleGroupId: reference,
    reference,
    createdAt: Date.now(),
  });

  return NextResponse.json({ reference, displayText: charge.displayText });
}
