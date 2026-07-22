/**
 * The only file that constructs a Paystack request body or parses a
 * Paystack response (Phase 8's Phase Rules) — every other file that needs
 * to charge a customer via M-Pesa calls `initiateMpesaCharge` and never
 * touches Paystack's wire shapes directly.
 *
 * Every fact below was verified against a real Paystack sandbox call in
 * this phase (not assumed from the plan's original research pass — see
 * this phase's overview.md for the full verification trail):
 *
 * - Phone: Paystack expects E.164 **with** the leading `+`
 *   (`+254712345678`). This project's canonical phone format (Phase 2's
 *   `normalizePhone`) is already exactly this — **OVERRIDE of the plan's
 *   original assumption**, which expected the `+` to be stripped
 *   (`254712345678`); a live sandbox call confirmed the opposite: the
 *   no-`+` form is rejected with `"Invalid phone number format"`, and the
 *   `+`-prefixed form is accepted. No conversion happens here at all —
 *   the canonical phone is passed straight through.
 * - Amount: Paystack's Charge API wants the amount as a **string of the
 *   currency's smallest subunit**, exactly like NGN kobo — confirmed via
 *   Paystack's own docs (`amount * 100`), not merely inferred from the
 *   sandbox response (which doesn't unambiguously distinguish the two
 *   interpretations on its own). KES has no historical alternate
 *   convention documented anywhere for this API.
 * - Email: required by the API with no product concept of one — a
 *   synthesized placeholder is used (OVERRIDE, per the plan). A `.local`
 *   TLD was tried first and rejected (`"Invalid Email Address Passed"`);
 *   a conventional TLD is required.
 * - `account`: omitted — only relevant for till-number charges
 *   (`provider: "mptill"`), not a standard customer-phone STK push.
 * - `metadata`: **a gap the plan's research didn't anticipate at all.**
 *   The Paystack webhook payload has no concept of this app's `shopId` —
 *   Paystack doesn't know it exists. `markCompleted(shopId, reference)`
 *   needs one, so `shopId` is sent in the Charge API's `metadata` field
 *   (a documented, standard Charge API parameter for exactly this kind of
 *   app-specific passthrough) and read back out of the webhook payload's
 *   `data.metadata.shopId`. Verified live: a real sandbox charge sent
 *   with `metadata: {shopId: "..."}`  came back with that exact object in
 *   `GET /transaction/verify/:reference`'s `data.metadata` — webhook
 *   payloads share the same underlying transaction representation, so
 *   this is expected (not separately observable without a publicly
 *   reachable webhook URL, which this environment doesn't have — see
 *   this phase's overview.md).
 */

export interface InitiateMpesaChargeInput {
  /** Canonical E.164 format with `+`, e.g. `"+254712345678"` (Phase 2's `normalizePhone` output) — passed straight through, not reformatted. */
  phone: string;
  /** Whole Kenyan Shillings — integer. Converted to Paystack's subunit string internally. */
  amountKES: number;
  /** Caller-generated (e.g. `crypto.randomUUID()`) so it's known before the Paystack call completes, for correlating the Convex `pending` row, the webhook, and the client's status poll. */
  reference: string;
  /** Used only to synthesize the placeholder email Paystack requires — see the module doc comment. */
  shopId: string;
}

export interface InitiateMpesaChargeResult {
  reference: string;
  /** Paystack's own charge status string (e.g. `"pay_offline"` for a successfully-initiated STK push) — not this project's own `Transaction.status` vocabulary. */
  paystackStatus: string;
  /** Human-readable text from Paystack meant to be shown to the payer, when present (e.g. "Please complete authorization process on your mobile phone"). */
  displayText?: string;
}

export class PaystackChargeError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PaystackChargeError";
  }
}

const PAYSTACK_CHARGE_URL = "https://api.paystack.co/charge";

interface PaystackChargeResponseBody {
  status: boolean;
  message: string;
  data?: {
    reference: string;
    status: string;
    display_text?: string;
  };
}

/** Initiates an M-Pesa STK push for a customer to approve on their phone. Throws `PaystackChargeError` on any failure — never an unhandled rejection. */
export async function initiateMpesaCharge(
  input: InitiateMpesaChargeInput,
): Promise<InitiateMpesaChargeResult> {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) {
    throw new PaystackChargeError("PAYSTACK_SECRET_KEY is not configured");
  }

  const requestBody = {
    email: `sale-${input.shopId}@dukapos.app`,
    amount: String(Math.round(input.amountKES * 100)),
    reference: input.reference,
    metadata: { shopId: input.shopId },
    mobile_money: {
      phone: input.phone,
      provider: "mpesa",
    },
  };

  let response: Response;
  try {
    response = await fetch(PAYSTACK_CHARGE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });
  } catch (error) {
    throw new PaystackChargeError("Paystack request failed", { cause: error });
  }

  const body = (await response.json()) as PaystackChargeResponseBody;
  if (!response.ok || !body.status || !body.data) {
    throw new PaystackChargeError(body.message || "Paystack charge failed");
  }

  return {
    reference: body.data.reference,
    paystackStatus: body.data.status,
    displayText: body.data.display_text,
  };
}
