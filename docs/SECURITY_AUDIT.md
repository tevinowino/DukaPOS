# Security Audit

Performed as Phase 10's hardening pass. Every finding below was independently verified against the actual running code/data in this environment (not asserted from reading source alone, where a live check was feasible) — see each finding's "Verified" line for the method.

## Scope

- Every Convex function (`convex/products.ts`, `convex/transactions.ts`) for `shopId` scoping.
- Every file that touches `GEMINI_API_KEY`, `PAYSTACK_SECRET_KEY`, or `CONVEX_DEPLOY_KEY`, confirming server-only usage and no `NEXT_PUBLIC_*` exposure.
- No client component importing a Convex client directly.
- Webhook signature verification (raw-body HMAC).
- PIN storage (hashed, not plaintext) in the actual running app.
- `totalKES` / payment-amount trust boundary (never taken from client input).

## Findings

### 1. `shopId` is an unguessable UUID, not an authenticated credential (accepted architectural debt — not a new finding)

Every Convex function and every API route that writes/reads shop-scoped data trusts a client-supplied `shopId` with no further authentication. Anyone who obtains a shop's `shopId` could read or write that shop's synced Convex data (products, transactions) by calling the same endpoints directly.

This is **already documented and explicitly accepted** in `ARCHITECTURE.md` §9, ADR-2's `DEBT(prudent-deliberate)`: reasonable for a single-device hackathon MVP where the UUID never leaves the device or the direct Convex calls, with a named remediation path (server-verified phone+PIN sessions) for any future multi-device/multi-tenant exposure. This audit confirms the implementation matches exactly what ADR-2 describes — no new debt introduced, no additional finding beyond what's already tracked. **Not re-flagged as new; not fixed here, per Phase 10's own instruction not to build auth as an out-of-scope fix.**

**Severity:** Medium (real, but bounded — requires knowing/guessing a specific shop's UUID, and the blast radius is limited to that one shop's data). **Status:** Accepted risk, documented.

### 2. All Convex functions correctly scope by `shopId` (verified — no gap)

Read `convex/products.ts` and `convex/transactions.ts` in full: all 6 exported functions (`upsertProduct`, `listByShop` ×2, `upsertTransaction`, `getByReference`, `markPending`, `markCompleted`) take `shopId` as a required argument and filter every query via a `by_shop` or `by_shop_and_*` index — none reads or writes across shops. **Verified:** direct source read of both files, cross-checked against `convex/schema.ts`'s index definitions.

**Severity:** N/A (no finding). **Status:** Confirmed correct.

### 3. No client component imports a Convex client directly (verified — no gap)

**Verified:** `grep -rn "from ['\"]convex/|ConvexHttpClient|convex/react" src` — the only 4 matches are `src/app/api/checkout/route.ts`, `src/app/api/checkout/status/route.ts`, `src/app/api/webhooks/paystack/route.ts`, `src/app/api/sync/route.ts`, all Route Handlers importing `convex/nextjs`'s server-side `fetchQuery`/`fetchMutation`. Matches ADR-1's stated design (§4 of `ARCHITECTURE.md`) exactly.

**Severity:** N/A (no finding). **Status:** Confirmed correct.

### 4. Secrets never appear in a client-importable file or a `NEXT_PUBLIC_*` variable (verified — no gap)

**Verified:**
- `grep -rn "NEXT_PUBLIC_" src` — zero matches anywhere in application code (the one `NEXT_PUBLIC_*` variable in the whole registry, `NEXT_PUBLIC_CONVEX_URL`, is read internally by the `convex/nextjs` package, never directly referenced in this project's own code).
- `GEMINI_API_KEY`, `PAYSTACK_SECRET_KEY`, `CONVEX_DEPLOY_KEY` are read in exactly 3 non-test source files: `src/lib/payments/paystackClient.ts`, `src/lib/ai/providers/hosted.ts`, `src/app/api/webhooks/paystack/route.ts` — none has a `"use client"` directive, and each is only imported transitively from Route Handlers under `src/app/api/**` (`grep -rln "paystackClient"` / `"hosted"` confirms this — no page or component file imports any of them).

**Severity:** N/A (no finding). **Status:** Confirmed correct.

### 5. Webhook signature verification runs against the raw body (re-verified — no regression)

`src/app/api/webhooks/paystack/route.ts` calls `request.text()` before any `JSON.parse`, and hashes that raw string with HMAC-SHA512 keyed by `PAYSTACK_SECRET_KEY`, comparing with `timingSafeEqual` (not `===`, avoiding a timing side-channel). The payload is never even parsed, let alone acted on, if the signature check fails. **Verified:** source read, plus the full test suite (including `src/app/api/webhooks/paystack/route.test.ts`, which specifically proves the raw-body-vs-reserialized-JSON distinction with a deliberately whitespace-sensitive payload) passes — `npm run test:unit`, 102/102 green as of this phase.

**Severity:** N/A (no finding — this was Phase 8's own explicitly-flagged "easy to accidentally reintroduce" bug class; confirmed not reintroduced). **Status:** Confirmed correct.

### 6. `totalKES` is always recomputed server-side from Convex, never trusted from client input (re-verified — no gap)

`src/app/api/checkout/route.ts`'s `CheckoutRequestBody` interface has no price/amount field at all — the route fetches the product's `priceKES` from Convex (`fetchQuery(api.products.listByShop, ...)`) and computes `totalKES = product.priceKES * body.quantity` itself. A client cannot influence the charged amount. **Verified:** source read; matches Phase 8's own test assertion (`checkout/route.test.ts` asserts the route ignores a deliberately wrong price sent in the request body).

**Severity:** N/A (no finding). **Status:** Confirmed correct.

### 7. PIN is hashed, not stored in cleartext — verified against real IndexedDB, not just the unit test

**Verified live:** completed real onboarding in a running instance of the app (`npx playwright test`, PIN `1234`), then read the `shopProfile` object store directly out of the browser's actual IndexedDB via `indexedDB.open("DukaDB")` in a `page.evaluate` call. The stored record was:

```json
{"shopId":"...", "shopName":"...", "phoneE164":"+254712345678", "pinHash":"cbc4ed13469be5a3f2263e0ea3fc95233ce5ac0fe3c71e39da22db7b5985445d", "pinSalt":"...", "createdAt":...}
```

`pinHash` is a 64-hex-character SHA-256 digest — the literal PIN `"1234"` appears nowhere in the stored record. `src/lib/identity/shopIdentity.ts`'s `hashPin` salts with a per-profile random UUID before hashing, so two shops choosing the same PIN produce different hashes.

**Severity:** N/A (no finding — the audit's job here was to confirm, and it's confirmed). **Status:** Confirmed correct. Note (already documented in `ARCHITECTURE.md` and Phase 2's overview.md, not a new finding): single-round SHA-256, not a slow KDF like bcrypt/scrypt/Argon2 — an explicit, reasoned choice for a 4-digit local-device PIN threat model (not intended to resist targeted offline brute-forcing of the full 10,000-value PIN space by someone who already has the hash and salt, which would require local device compromise in the first place). Acceptable for this threat model; would need revisiting if the PIN's role ever expanded beyond a local app lock.

### 8. Minor: a commented-out live Paystack secret key sits in the local `.env.local` file

**Finding:** `.env.local` contains a commented-out `PAYSTACK_SECRET_KEY=sk_live_...` line (from before the sandbox `sk_test_...` key was added), alongside the active, in-use sandbox key. **Verified:** `.env.local` is correctly gitignored (`.gitignore`'s `.env*` pattern) and `git log --all --full-history -- .env.local` returns no results — this value was **never committed**, so there is no actual exposure. Still, a live secret key sitting in any local file — even commented out, even never committed — is worth flagging so it can be removed, since a future copy-paste of that file (e.g., sharing it with a teammate, or accidentally `git add -f`-ing it) would leak a real, usable production credential.

**Severity:** Low (no actual exposure occurred; this is a "reduce blast radius of a future mistake" recommendation, not an active vulnerability). **Status:** Not modified by this audit (editing the user's local, uncommitted secrets file wasn't judged to be this phase's call to make unilaterally) — **recommend the user delete that commented-out line**, or better, revoke that live key from the Paystack dashboard if it was ever a real production key rather than a placeholder.

## Summary

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | `shopId` as sole tenant-scoping credential | Medium | Accepted (ADR-2, pre-existing) |
| 2 | Convex `shopId` scoping | — | Confirmed correct |
| 3 | No client-side Convex imports | — | Confirmed correct |
| 4 | Secrets server-only, no `NEXT_PUBLIC_*` leakage | — | Confirmed correct |
| 5 | Webhook raw-body signature verification | — | Confirmed correct |
| 6 | `totalKES` server-computed | — | Confirmed correct |
| 7 | PIN hashed (verified live in IndexedDB) | — | Confirmed correct |
| 8 | Stale commented-out live key in local `.env.local` | Low | Open — user action recommended |

No new fixable vulnerability was found beyond the pre-existing, already-accepted ADR-2 debt and the low-severity local-file hygiene note above.
