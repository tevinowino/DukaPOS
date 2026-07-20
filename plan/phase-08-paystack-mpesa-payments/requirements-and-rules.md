# Phase 8 — Paystack M-Pesa Payments: STK push, webhook, pending→completed flow

> Audience: implementing AI agent. Read [`plan/global-rules.md`](../global-rules.md) and Phase 5's `overview.md` first (Phase 6/7's overviews are not required reading for this phase — it doesn't touch `lib/ai/`). Follow the steps in order.
>
> **⚠️ This is the highest-risk phase in the plan — it moves real money, even in sandbox mode.** Work slowly. Do not guess at Paystack payload shapes beyond what's verified below — if anything is unclear, fetch `https://paystack.com/docs/api/charge/` directly and re-verify rather than extrapolating from training data. Test every path in Paystack's sandbox before considering this phase done; never test against a live secret key.
>
> **Research-verified facts (verified live against `https://paystack.com/docs/api/charge/`, current as of this plan's writing):**
> - Endpoint: `POST https://api.paystack.co/charge`
> - Auth: `Authorization: Bearer {PAYSTACK_SECRET_KEY}`, `Content-Type: application/json`
> - Request body for an M-Pesa (Kenya) charge:
>   ```json
>   {
>     "email": "customer@example.com",
>     "amount": "10000",
>     "mobile_money": {
>       "phone": "254712345678",
>       "provider": "mpesa"
>     }
>   }
>   ```
>   `email` is required by the API even though this product has no concept of customer email — use a synthesized placeholder (e.g. `sale-{shopId}@dukapos.local`) and document this as an OVERRIDE, since it's an API requirement the product docs never anticipated.
>   `amount` is a **string**. **Unverified — confirm in sandbox before wiring the real conversion:** whether `amount` for an M-Pesa mobile-money charge is whole KES as a string or subunits-as-a-string (Paystack's general Charge API convention for card charges is subunits, but M-Pesa/KES sandbox behavior specifically was not directly confirmed in this research pass). Do a real sandbox charge for a known small amount (e.g. 1 KES) first and confirm what actually gets charged before wiring the checkout flow to real cart totals — record the finding in `overview.md`.
>   `phone` is E.164 **without the `+`** (`254712345678`, not `+254712345678`) — confirm this exact formatting against a real sandbox call, since the docs example omits the `+` but this project's canonical phone format from Phase 2 (`+254712345678`) includes it; the conversion (strip the `+`) happens in exactly one place: `lib/payments/paystackClient.ts`.
>   `account` field: documented as "the M-PESA till account number" — only relevant for till-number charges (`provider: "mptill"`), not for a standard customer-phone STK push (`provider: "mpesa"`). Omit it for this project's flow; do not send an empty string.
> - Checking status: `GET /charge/:reference` — Paystack's own guidance is to wait ~10+ seconds after an initial pending response before polling this endpoint for a status change. This is Paystack's own polling recommendation; it's separate from and in addition to ADR-3's client-facing poll against this project's own `/api/checkout/status` route.
> - Webhook signature verification: compute `HMAC-SHA512` of the **raw, unparsed** request body using `PAYSTACK_SECRET_KEY` as the key, hex-encode, compare (constant-time) against the `x-paystack-signature` request header. **This must run against the raw body — if any Next.js body-parsing middleware transforms the payload before this check runs, the signature will never match; use the Route Handler's raw `request.text()` (or equivalent) before any JSON parsing.**
> - The webhook fires `charge.success` (and other charge lifecycle events) to whatever webhook URL is configured in the Paystack dashboard for this account — confirm the exact event name(s) to handle by triggering a real sandbox transaction and inspecting what arrives, rather than assuming `charge.success` is the only relevant event; document what you actually observed.

## 1. Objective

When this phase is done: a shopkeeper can choose "Pay via M-Pesa" at checkout, the customer receives a real STK push (sandbox) prompting their M-Pesa PIN, the sale is recorded locally as `pending`, and once Paystack's webhook confirms payment (verified via signature), the transaction flips to `completed` and stock is deducted exactly once — with the client learning about this via the ADR-3 polling mechanism, since the webhook cannot reach the browser's IndexedDB directly.

## 2. Read First

- `PRD.md` §5 "Payments", §6 (security row: webhook signature verification), §9 (Paystack integration is second-priority, "build after core loop + one Gemma feature")
- `ARCHITECTURE.md` §5.3 (sale with M-Pesa flow) and §9 ADR-3 (the exact resolution this phase implements — re-read it now, it is the spec for this phase's core mechanism)
- Phase 4 `overview.md` (final `Transaction` shape, `deductStock`/stock-mutation logic — mirrored, not imported, into the Convex mutation this phase writes) and Phase 5 `overview.md` (exact `convex/schema.ts` transactions table, `getByReference` query signature)

## 3. Deliverables

| Path | Purpose |
|---|---|
| `src/lib/payments/paystackClient.ts` | `initiateMpesaCharge({phone, amountKES, reference})`, wraps the Charge API call; phone/amount formatting per the verified facts above, isolated here |
| `convex/transactions.ts` (extended) | `markPending(shopId, transaction)` — writes a `pending` transaction keyed by `reference`; `markCompleted(shopId, reference)` — idempotent flip to `completed` (a webhook retry must not double-process); both used by the Next.js routes below |
| `src/app/api/checkout/route.ts` | `POST`: recomputes `totalKES` server-side from the shop's synced Convex product data (never trusts a client-sent price, per global-rules §5.4), calls `paystackClient.initiateMpesaCharge`, writes the `pending` transaction to Convex via `markPending`, returns the `reference` to the client |
| `src/app/api/webhooks/paystack/route.ts` | Verifies signature against the raw body; on a successful-charge event matching a known `reference`, calls `markCompleted`, which performs the idempotent stock decrement (mirrored logic from Phase 4's `deductStock`, written directly in the Convex mutation since Convex can't import browser-only Dexie code) |
| `src/app/api/checkout/status/route.ts` | `GET ?reference=...`: `fetchQuery`s `convex.transactions.getByReference`, returns its current status — this is the ADR-3 poll target |
| `src/app/[locale]/checkout/mpesa/page.tsx` | "Enter M-Pesa number" → initiate → "check your phone" waiting screen polling `/api/checkout/status` per ADR-3 (every 3s, up to 90s) → success (applies the local Dexie stock decrement + marks the local transaction completed, matching what Convex already did) or timeout (transaction stays `pending`, reconciled on next general sync) |

## 4. Implementation Steps (in order)

1. **Get Paystack sandbox test keys** (test secret + public key from the Paystack dashboard, test mode). Add `PAYSTACK_SECRET_KEY`/`PAYSTACK_PUBLIC_KEY` to `.env.local` (real sandbox values, gitignored) and their names to `.env.local.example`.
2. **Write `paystackClient.ts` first, docstring-first**, isolating: the phone-format conversion (E.164-with-plus → digits-without-plus), the amount-format conversion (resolve the unverified subunit-vs-whole-KES question via a real sandbox test call before finalizing this), and the placeholder-email synthesis (documented OVERRIDE per the facts block).
3. **Do a real, manual sandbox charge for a tiny known amount FIRST**, before wiring any UI to it, specifically to resolve the unverified `amount` format question. Record the exact request sent and the amount actually reflected in the Paystack dashboard/sandbox response in `overview.md`. Do not proceed to step 4 until this is confirmed — guessing wrong here either overcharges or undercharges in a way that won't surface until a real demo.
4. **Extend `convex/transactions.ts`** with `markPending` and `markCompleted`. `markCompleted` must be idempotent on `reference` (check current status before applying the stock decrement — if already `completed`, no-op) since Paystack may retry webhook delivery. The stock-decrement math mirrors Phase 4's `deductStock` clamp-at-zero behavior, reimplemented as a Convex mutation (it cannot literally import Phase 4's Dexie-bound code) — keep the two implementations' *behavior* identical and note this duplication explicitly as an accepted mirror, not an oversight.
5. **Build `/api/checkout/route.ts`.** Recompute `totalKES` from Convex product data scoped to the request's `shopId` (never from a client-sent amount, per global-rules §5.4) — if the relevant product hasn't synced to Convex yet (offline edit pending), reject with a clear "sync before charging via M-Pesa" error rather than trusting a client-sent price. Generate a `reference` (e.g. `crypto.randomUUID()`), call `paystackClient.initiateMpesaCharge`, call `markPending`, return `{ reference }`.
6. **Build `/api/webhooks/paystack/route.ts`.** Read the raw body (`await request.text()`) before any JSON parsing, verify the signature per the facts block, only then `JSON.parse` and act. On the confirmed successful-charge event (verify the exact event name per the facts block's note), extract the `reference`, call `markCompleted`. Respond `200` promptly. On signature failure, respond `401`/`400` and do not process the payload at all — log the failure (no payload contents in the log, per global-rules §7 on debug noise/secrets).
7. **Build `/api/checkout/status/route.ts`** — a thin `fetchQuery` wrapper, safe to call from a GET handler since it has no side effects (global-rules §6/§5.2).
8. **Build the checkout UI.** M-Pesa phone entry (pre-fillable from the shop profile's phone if that's likely the payer, but editable — the payer may be a customer, not the shopkeeper), initiate, waiting screen with clear "enter your M-Pesa PIN on your phone" messaging and a visible countdown/spinner, polling per ADR-3. On observed completion: apply the local Dexie stock decrement and mark the local `Transaction` completed (mirroring what Convex did — do not skip this, or the local-first UI will show stale stock until the next general sync). On timeout: clear messaging that the payment may still complete and will reconcile later, not a scary error.
9. **Enable the "M-Pesa" option in the Phase 4 sell flow** now that it's real (whatever Phase 4 documented — hidden or disabled — flip it on and wire it to this checkout flow).
10. **Verify end-to-end in sandbox:** initiate a charge, receive a real sandbox STK prompt (or use Paystack's documented sandbox test-number behavior if a real phone isn't available — check current sandbox docs for how to simulate approval/decline), confirm the webhook fires, confirm the status poll observes completion, confirm stock deducted exactly once.

## 5. Edge Cases & Required Handling

| Edge case | Required handling |
|---|---|
| Customer declines/times out the STK prompt on their phone | Paystack's webhook (or lack of a `charge.success` event within the poll window) means the transaction stays `pending` then effectively abandoned; the checkout UI's timeout path handles this the same as any other non-completion — no special "declined" UI is required for the MVP unless Paystack sends a distinguishable failure event, in which case surface it if it's easy to. Test the timeout path regardless. |
| Webhook delivered twice for the same successful charge (Paystack's documented retry behavior) | `markCompleted`'s idempotency (step 4) means the second call is a no-op — stock is decremented exactly once. Test it directly at the Convex-function level: call `markCompleted` twice with the same `reference`, assert the stock decrement applied only once. |
| Webhook payload with an invalid/missing signature | Rejected before any parsing or Convex call; test with a deliberately wrong signature value. |
| `/api/checkout` called for a product whose price hasn't synced to Convex yet | Rejected with the "sync before charging" error from step 5, not silently charged at a stale or zero price. Test it. |
| Client's poll window (90s) elapses with no completion, but the payment actually succeeds moments later | The transaction reconciles later via Phase 5's general `/api/sync`/pull path if one exists, or stays visibly `pending` in the transaction log until a future manual "check again" action — document exactly what happens, since Phase 5 explicitly scoped general pull-sync as out of scope; if there's a genuine gap here (pending forever with no reconciliation), flag it clearly as `DEBT(prudent-deliberate)` with a remediation path, don't paper over it. |
| Two devices/tabs somehow both polling the same `reference` (unlikely in single-device MVP, but the status route is stateless GET, so this is safe by construction) | No special handling needed — document why (idempotent read, no mutation). |

## 6. Required Tests

- `src/lib/payments/paystackClient.test.ts`: `initiateMpesaCharge({phone: '+254712345678', amountKES: 150, reference: 'abc'})` sends a request body with `phone: '254712345678'` (no `+`), the correctly-formatted `amount` per whatever sandbox finding step 3 produced (document the exact expected string in the test itself), `mobile_money.provider: 'mpesa'`, and a synthesized `email`; mock `fetch`, assert on the request body sent. A non-2xx/error response from Paystack throws a typed error, not an unhandled rejection.
- `convex/transactions.test.ts` (extended): `markCompleted` called twice with the same `reference` results in the stock decrement having applied exactly once (assert final `stockQty`, not just "no error"); `markCompleted` called for a `reference` with no matching `pending` transaction is a safe no-op, not a crash.
- `src/app/api/webhooks/paystack/route.test.ts`: a request with a valid signature (computed the same way the route computes it, using a test secret) and a successful-charge payload results in `markCompleted` being called (mock it) with the right `reference`; a request with an invalid signature results in a 4xx and `markCompleted` is never called; the raw-body-based verification is proven by constructing a test where a JSON-reserialized version of the body would produce a *different* signature than the raw original — assert the route uses the raw form (this specifically guards against the "gotcha" noted in the research).
- `src/app/api/checkout/route.test.ts`: a request for a product whose current Convex-synced price is known results in a `totalKES` computed from that Convex data, not from any price the test's request body claims (send a request with a deliberately wrong client-side price field, if the route even accepts one, and assert it's ignored); a request for a product with no synced Convex price returns the "sync before charging" error and never calls `paystackClient`.
- `src/app/api/checkout/status/route.test.ts`: returns the current status for a known `reference` (mock the Convex query); returns a clear not-found response for an unknown `reference`.
- `e2e/mpesa-checkout.spec.ts` (Playwright, against Paystack's real sandbox if credentials are available in the test environment, otherwise fully mocked at the network boundary — document which and why): initiate an M-Pesa checkout, confirm the waiting screen appears, simulate/observe a completion, confirm the UI transitions to success and stock reflects the deduction.

## 7. Phase Rules

- Never use a live Paystack secret key anywhere in development, tests, or this repo. Sandbox only for the entire hackathon build.
- The webhook route trusts nothing until the signature check passes — no exceptions, no "just for local testing" bypass left in committed code.
- `paystackClient.ts` is the only place that touches Paystack's request/response shapes — no other file constructs a Paystack request body or parses a Paystack response directly.
- Do not build live-mode/production Paystack cutover, KYC flows, or refunds — explicitly post-hackathon per `PRD.md` §5.
- Do not silently change ADR-3's polling design (interval, duration) without updating `ARCHITECTURE.md` — if you need to change it based on real sandbox latency observed in step 10, that's a legitimate contract change and belongs in an ADR update, not a silent deviation.

## 8. Definition of Done

1. A human can, in Paystack sandbox: choose M-Pesa at checkout, trigger an STK push, confirm/simulate payment, and observe the app's UI transition from "waiting" to "paid," with stock correctly deducted exactly once and visible in the products list.
2. All §6 tests green; `npm run lint` and `npm run build` clean; `PAYSTACK_SECRET_KEY`/`PAYSTACK_PUBLIC_KEY` in `.env.local.example`.
3. `overview.md` completed, including: the resolved `amount`-format finding from step 3 (this is load-bearing — Phase 10's audit will re-check it); the exact webhook event name(s) observed from a real sandbox transaction; confirmation that idempotency was tested and holds; any gap found in the "poll window elapses, payment succeeds later" edge case and its `DEBT` entry if one was needed.
