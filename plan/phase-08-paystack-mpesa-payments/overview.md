# Phase 8 — Overview (completed by the implementing agent)

**This was the highest-risk phase, per the phase file's own warning. Worked slowly and deliberately, per its instruction — every load-bearing assumption below was verified against a real Paystack sandbox call before being wired into any code, not guessed.**

## Status

- [x] All deliverables built
- [x] All required tests green
- [x] Lint + typecheck clean
- Completed on: `2026-07-22`

**Real Paystack sandbox test-mode keys were added to `.env.local` by the user specifically for this phase** (this phase's own plan file explicitly refused to proceed on the `amount` format question without real verification — asked the user directly rather than guessing on a money question; they added sandbox keys). Confirmed via `grep` that the key has the `sk_test_` prefix (sandbox, not live) before any use, per Phase Rules' "never use a live secret key" rule. **`NEXT_PUBLIC_CONVEX_URL` is still not set** (Phase 5's gap, unchanged) — see "How to Manually Verify This Phase" for exactly what that does and doesn't block.

## What Was Built

- `src/lib/payments/paystackClient.ts` — `initiateMpesaCharge`; the only file touching Paystack's wire shapes.
- `convex/transactions.ts` (extended) — `markPending`, `markCompleted` (idempotent on `reference`, mirrors — doesn't import — `applyStockDelta`'s clamp logic).
- `src/app/api/checkout/route.ts` — recomputes `totalKES` server-side from Convex, never trusts a client-sent price.
- `src/app/api/webhooks/paystack/route.ts` — raw-body HMAC-SHA512 signature verification before any parsing.
- `src/app/api/checkout/status/route.ts` — the ADR-3 poll target.
- `src/app/[locale]/checkout/mpesa/page.tsx` — phone entry → initiate → poll → success/timeout, single product line (see Design Decisions (e)).
- `src/app/[locale]/sell/page.tsx` (modified) — M-Pesa is now a real, selectable payment method (enabled only for a single-line cart; disabled with an explanatory message otherwise), replacing Phase 4's disabled placeholder.
- `messages/en.json`, `messages/sw.json` (extended) — `mpesaCheckout` namespace, plus `sell.paymentMpesa`/`mpesaSingleItemOnly`/`payWithMpesaButton` (replacing the removed `paymentMpesaComingSoon`).
- Tests: `src/lib/payments/paystackClient.test.ts`, extended `convex/transactions.test.ts`, `src/app/api/webhooks/paystack/route.test.ts`, `src/app/api/checkout/route.test.ts`, `src/app/api/checkout/status/route.test.ts`.
- `e2e/mpesa-checkout.spec.ts` — full mocked journey (see Design Decisions (f) for why mocked, not live sandbox, despite having real credentials).

## Design Decisions & Rationale — the load-bearing verified facts

**All four of these were resolved by real sandbox API calls in this session (standalone scratch scripts, deleted after use — not committed), not by reading docs alone:**

**(a) Amount is in subunits (cents), confirmed two ways.** Paystack's own docs, fetched live: *"This same principle applies to KES... Sending an amount in subunits simply means multiplying the base amount by 100."* To charge KES 150, send `"15000"`. `paystackClient.ts` does `String(Math.round(amountKES * 100))`. This resolves the phase file's explicitly-flagged unverified question, definitively — not a guess.

**(b) Phone format: OVERRIDE of the plan's original assumption.** The plan expected `+` stripped (`254712345678`). A real sandbox charge with that form was rejected: `{"message": "Invalid phone number format"}`. The `+`-prefixed form (`+254712345678` — this project's own canonical format from Phase 2) was accepted. `paystackClient.ts` passes the canonical phone straight through with **no conversion at all** — the opposite of what the plan's research pass assumed. Documented in the module's own doc comment as an explicit override with the verification trail.

**(c) Email: a `.local` TLD is rejected.** First attempt used `sale-{shopId}@dukapos.local` per the plan's suggested placeholder pattern — got `{"message": "Invalid Email Address Passed"}`. Switched to `sale-{shopId}@dukapos.app` (a real gTLD), which was accepted. The plan's own suggested placeholder domain would not have worked.

**(d) A gap the plan's research didn't anticipate at all: the webhook payload has no concept of this app's `shopId`.** `markCompleted(shopId, reference)` needs one, but Paystack has never heard of it. Resolved by sending `shopId` in the Charge API's `metadata` field (a real, documented parameter) and reading it back from the webhook payload's `data.metadata.shopId`. Verified live: a real charge sent with `metadata: {shopId: "shop-abc-123", ...}` came back with that exact object in `GET /transaction/verify/:reference`'s `data.metadata` field. Webhook payloads share the same underlying transaction representation as the verify endpoint, so this is expected to hold for the live webhook too — **the one piece of this phase not independently observable in this environment**, since receiving a real webhook requires a publicly reachable URL this sandboxed environment doesn't have (see "How to Manually Verify This Phase").

**(e) M-Pesa checkout is scoped to a single product line, not Phase 4's multi-item cart — a deliberate scope-narrowing not explicitly stated in the phase file, but consistent with its literal Convex signatures.** The phase file's own deliverables specify `markPending(shopId, transaction)` and `markCompleted(shopId, reference)` in the *singular* — one reference maps to one transaction. Supporting a multi-item M-Pesa cart would require either multiple Paystack charges per sale (bad UX — multiple STK pushes) or one charge covering several `Transaction` rows under one `reference` (a materially bigger `markCompleted` redesign, decrementing stock for several products atomically). Given the highest-risk-phase warning to work carefully and not over-scope, the sell page only enables the M-Pesa button when exactly one line item is in the cart (disabled otherwise with an explanatory message: "M-Pesa checkout is one item at a time — use Cash for multiple items, or remove extra lines"). `localId`, `saleGroupId`, and Paystack's `reference` are all unified to the same generated value for a given M-Pesa sale — this makes the client's own later Dexie→Convex sync of the same transaction upsert cleanly onto the exact row `markPending`/`markCompleted` already touched, rather than creating a duplicate.

**(f) `e2e/mpesa-checkout.spec.ts` is mocked at the network boundary, not run against the real sandbox — despite real credentials being available.** Three reasons, not just habit: (1) no real phone is available to approve a real STK push, so an automated "success" path can't be observed live regardless of mocking; (2) Paystack's own guidance is to wait 10s+ before polling a real charge's status, which would make every CI run slow and rate-limit-sensitive for zero additional coverage; (3) the actual request/response *shapes* this phase depends on were already verified for real via the standalone scratch scripts (Design Decisions (a)-(d)) — the E2E test's job is to prove the UI wiring is correct, which mocking demonstrates just as well.

**(g) Webhook event name: confirmed `charge.success`** via Paystack's live webhook documentation (`https://paystack.com/docs/payments/webhooks/`) — matches the phase file's assumption, no correction needed here. Signature scheme (HMAC-SHA512 of the raw JSON body, hex-encoded, keyed by the secret) also confirmed as documented, no correction needed.

## Deviations from Requirements

1. **Phone format OVERRIDE** — keep the `+`, don't strip it (Design Decisions (b)). Contradicts the plan's stated assumption; corrected based on live verification, documented in `paystackClient.ts`'s own doc comment per the plan's own instruction for handling deliberate contradictions.
2. **Email placeholder domain changed** from the plan's suggested `dukapos.local` to `dukapos.app` (Design Decisions (c)) — the suggested domain doesn't actually work.
3. **`metadata` field added to the Charge API request** — not mentioned anywhere in the plan's research, but necessary (Design Decisions (d)).
4. **M-Pesa checkout is single-product-line only** (Design Decisions (e)) — not explicitly stated as in-scope-or-not by the phase file, but the most faithful reading of its literal Convex function signatures, and the safer choice for the highest-risk phase.

## Issues Encountered & How They Were Fixed

- **The documented Paystack sandbox test number (`254708374149`, no `+`) was rejected outright** with `"Invalid phone number format"` — not a real M-Pesa error, a request-format rejection before the charge was even attempted. Diagnosed by trying several phone variants (local format with leading 0, E.164 with `+`, a different KE mobile number) against the same amount — only the `+`-prefixed form got past phone validation (onto a *different* error, about the email, which led to finding (c)). This is the single most load-bearing finding of this phase, since guessing wrong here would have meant every M-Pesa charge attempt failing silently-ish (a confusing "Invalid phone number format" error) in a live demo.
- **First real charge attempt's response didn't unambiguously reveal the amount-subunit interpretation** — the Charge API's immediate response doesn't echo amount at all, and `GET /transaction/verify/:reference` echoes back whatever raw number was sent (not evidence either way, since Paystack's internal representation is subunit-based across currencies regardless of what's echoed). Resolved by checking Paystack's own documentation directly rather than trying to infer it from more sandbox probing (which would have been inconclusive, since sandbox mode likely doesn't enforce real M-Pesa transaction limits that could have otherwise been used as a differentiating signal).

## Tests Written

- `src/lib/payments/paystackClient.test.ts`: sends the phone with its `+` intact, amount in subunits (`"15000"` for 150 KES), a synthesized `@dukapos.app` email, `metadata.shopId`, and `provider: "mpesa"`; returns the reference/status/displayText from a successful response; throws `PaystackChargeError` (not an unhandled rejection) on an error response or missing secret key.
- `convex/transactions.test.ts` (extended): `markPending` writes a findable pending mpesa transaction; `markCompleted` called twice with the same reference flips status to `completed` and decrements stock **exactly once** (asserted via final `stockQty`, not just "no error" — 20 → 17 for a quantity-3 sale, not 14); `markCompleted` for an unknown reference is a safe no-op (returns `null`, doesn't throw).
- `src/app/api/webhooks/paystack/route.test.ts`: a validly-signed `charge.success` payload calls `markCompleted` with the right `shopId`/`reference`; an invalid signature is rejected (401) without calling `markCompleted`; a missing signature header is rejected; a validly-signed but irrelevant event (`charge.failed`) is acknowledged (200) without calling `markCompleted`; **the raw-body gotcha is directly proven** — a body with deliberately unusual whitespace, signed against its exact raw bytes, verifies correctly (proving the route hashes the raw text, not a `JSON.parse`→`JSON.stringify` round-trip, which would have produced a different signature and failed).
- `src/app/api/checkout/route.test.ts`: `totalKES` is computed from Convex's synced product price, ignoring a deliberately wrong price field sent in the request body; a product not yet synced to Convex returns the sync-before-charging error (409) and never calls Paystack.
- `src/app/api/checkout/status/route.test.ts`: returns the current status for a known reference; returns 404 for an unknown one; returns 4xx for missing query params.
- `e2e/mpesa-checkout.spec.ts`: full UI journey — seed a product, select M-Pesa (only enabled for a single-line cart), enter phone, send the request, see the waiting screen, observe the mocked status flip to `completed` on the *second* poll (proving the UI actually polls, not just trusts the first response), see the success message, confirm stock deducted by exactly the sold quantity.

## How to Run Automated Tests

```bash
npm run test:unit   # includes all of this phase's tests — no live Paystack/Convex calls, everything mocked
npm run test:e2e    # includes mpesa-checkout.spec.ts — also fully mocked, see Design Decisions (f)
```

## How to Manually Verify This Phase

**Two distinct things were verified, and one important thing was not — being precise about which is which:**

1. **Verified for real, directly against the live Paystack sandbox API** (not through this app's UI — standalone scratch scripts): the exact request/response shapes in Design Decisions (a)-(d) above. This is the load-bearing verification the phase file demanded before writing any checkout code, and it happened.
2. **NOT verified: the full UI flow through this app** (choose M-Pesa at checkout → real STK push → real webhook → UI transitions to "paid"). This requires a live Convex deployment (`/api/checkout` calls `fetchQuery(api.products.listByShop, ...)`, which needs `NEXT_PUBLIC_CONVEX_URL`) and a publicly reachable URL for Paystack to deliver the webhook to (this sandboxed environment has neither). **Once Convex is connected and the app is deployed somewhere with a public URL** (Phase 10's deployment runbook, or any earlier manual deploy):
   - Configure the Paystack dashboard's webhook URL to point at `https://<deployed-url>/api/webhooks/paystack`.
   - Walk the real flow: sell page → M-Pesa → enter a real phone number (or the sandbox test number, which will time out rather than succeed, useful for testing the timeout path) → confirm the STK push arrives / the sandbox behavior observed in this phase's scratch testing (`pay_offline` → `failed` after ~10s for the test number, since it can't actually be approved) → for a genuine success case, a **real Kenyan phone number** would need to approve the prompt.
   - Confirm the webhook actually fires with `metadata.shopId` present and correctly shaped (Design Decisions (d)'s one unverified assumption).

## Known Debt

- **`DEBT(prudent-deliberate)`: the "poll window elapses, payment succeeds later" edge case has a real, acknowledged gap.** If the shopkeeper's 90s poll window times out but the webhook fires afterward, `markCompleted` still runs (Convex is updated correctly — stock decrements there), but **the client's local Dexie copy never learns about it**, since Phase 5 explicitly scoped general pull-sync as out of scope (device→Convex only) and this phase's local-completion mirroring only runs from the active poll loop. The transaction stays visibly `pending` in the local transaction log indefinitely, and local stock stays un-decremented, until some future feature adds either a pull-sync mechanism or a manual "check again" affordance. Not silently papered over — flagging exactly per the phase file's instruction for this specific edge case. Remediation path: a Phase 9+/post-hackathon feature to either (a) re-poll `/api/checkout/status` for any locally-`pending` mpesa transactions on app foreground/reconnect, or (b) build the general pull-sync mechanism Phase 5 deferred.
- Metadata-based `shopId` passthrough to the webhook (Design Decisions (d)) is unverified against a real webhook delivery — flagged clearly above, not hidden.
- Swahili-review debt list (carried from Phases 1–7) gains this phase's `mpesaCheckout` namespace and the `sell` namespace's payment-method key changes.

## Handoff Notes for Phase 9

- `PAYSTACK_SECRET_KEY`/`PAYSTACK_PUBLIC_KEY` are both real sandbox values in `.env.local` now (confirmed `sk_test_`-prefixed) — do not commit `.env.local`, and if Phase 9/10 need to reference "is Paystack configured," check for the key's presence, not its value.
- The sell page's payment-method UI (`sell.paymentMpesa`, `sell.mpesaSingleItemOnly`, `sell.payWithMpesaButton`) and the whole `mpesaCheckout` namespace are new Swahili-review surface area, same caveat as every phase since Phase 1.
- If Phase 9/10 touch the sell page or checkout flow, remember the single-product-line M-Pesa scope decision (Design Decisions (e)) — it's a deliberate constraint, not an oversight to "fix" by wiring up multi-item M-Pesa without first redesigning `markPending`/`markCompleted` for it.
- Phase 10's security audit should specifically re-check: (1) the webhook's raw-body signature verification (tested, but worth a manual code read given how easy this class of bug is to reintroduce accidentally), (2) that `totalKES` is never taken from client input anywhere in the checkout path, (3) that no Paystack secret ever appears in a client bundle or log line.
- Phase 10's audit should also treat the "poll window elapses, payment succeeds later" debt item above as a known, accepted gap to report on, not something to silently discover and flag as a surprise.
