# Global Rules — Binding for Every Phase

You are a mid-level implementing agent. These rules exist because the decisions have already been made at the architecture level; your job is disciplined execution. When you feel an urge to deviate, re-read the rule, then either follow it or stop and record the conflict in the phase's `overview.md` — never silently improvise.

## 0. Read before writing any code

1. `AGENTS.md` / `CLAUDE.md` at the repo root — this Next.js version has breaking changes vs. training data; read the relevant guide under `node_modules/next/dist/docs/` before writing framework code you're not sure of.
2. `PRD.md` and `ARCHITECTURE.md` at the repo root, **including the Architecture Decision Records in ARCHITECTURE.md §9** — those ADRs resolve every ambiguity a prior draft left open and are binding.
3. The previous phase's `overview.md` (handoff notes) — path: `plan/phase-{N-1}-*/overview.md`.

## 1. Mindset: strategic, not tactical

- Working code is the entry bar, not the goal. Every change must leave the system simpler to change next time.
- No quick patches, no leaky abstractions, no "TODO: fix later" without a documented debt entry (§9).
- Before coding a feature, write the docstring/contract of every exported function before its body. If the docstring is hard to write crisply, the design is wrong — redesign before implementing.

## 2. Architecture principles

- **Deep modules, one file per business domain:**
  - `src/lib/db/` — Dexie schema, table definitions, local read/write helpers (Product, Transaction, SyncQueue).
  - `src/lib/identity/` — PIN hashing/verification, shopId generation/persistence (ADR-2).
  - `src/lib/ai/` — `gemmaClient.ts` (public interface), `types.ts`, `providers/hosted.ts`, `providers/selfhosted.ts`.
  - `src/lib/payments/` — `paystackClient.ts`.
  - `src/lib/sync/` — queue draining, conflict-free merge logic, online/offline detection.
  - `convex/` — schema + mutations/queries/actions, one file per table domain (`convex/products.ts`, `convex/transactions.ts`, `convex/schema.ts`).
- **Pure logic lives in pure functions.** Validation, stock-math, currency formatting, phone-number normalization, PIN hashing wrappers — all plain, framework-free modules with exhaustive unit tests. React components and API route handlers stay thin: read input → call a lib function → render/respond.
- **No temporal decomposition.** Do not split a user-facing flow into `startX()`/`finishX()` public functions that callers must sequence. One deep entry point per user intention (e.g., `recordSale(input)`, not `beginSale()` + `deductStock()` + `logTransaction()` called separately from a component).
- Handlers over ~30 lines of active logic must extract named helpers.

## 3. Lexicon (use these words, never synonyms)

| Term | Meaning | Never call it |
|---|---|---|
| `Product` | An inventory item record (barcode, photo, or manual sourced) | Item, SKU, Good |
| `Transaction` | A single sale record, one or more products, one payment | Order, Sale (as a noun in code), Receipt |
| `shopId` | Locally generated UUID identifying this shop for sync scoping | userId, tenantId, accountId |
| `SyncQueue` | Local-only queue of unsynced writes awaiting `/api/sync` | Outbox (fine in prose, not in code), Buffer |
| `ProductGuess` | Normalized Gemma vision output before shopkeeper confirms | Prediction, Result, AiProduct |
| `StockUpdate` | Normalized Gemma text-parsing output (one structured inventory change) | Delta, Change, Patch |
| `priceKES` / `totalKES` | Integer amount in whole Kenyan Shillings | price, amount, cost (unqualified) |
| PIN lock | The local device app-lock from ADR-2 | login, auth, account (do not imply server auth exists) |

## 4. Domain-value rules

- **Money:** all currency fields are integers in whole KES (`priceKES`, `totalKES`) — no floats, no subunits, matching how a shopkeeper thinks in shillings. Paystack's Charge API wants `amount` as a **string of the smallest currency subunit** for other channels, but confirm the exact subunit convention for `mobile_money`/`mpesa` charges in Phase 8's sandbox before wiring the conversion (see Phase 8 "Research-verified facts" — this is flagged unverified there). Do the KES→Paystack-subunit conversion in exactly one place: `lib/payments/paystackClient.ts`.
- **Phone numbers:** canonical stored format is E.164 with Kenya's country code, e.g. `+254712345678`. One shared normalizer (`lib/identity/normalizePhone.ts` or similar, introduced in Phase 2) converts any local-format input (`0712...`, `712...`) to canonical form; every module that touches a phone number imports it rather than re-implementing the transform.
- **`shopId`:** generated once (`crypto.randomUUID()`) on first app launch, persisted in IndexedDB (not `localStorage`, so it lives alongside the data it scopes), read from exactly one accessor in `lib/identity/`. Every Convex mutation/query that reads or writes shop data takes `shopId` as an explicit argument — see §5.2.
- **Stock quantity:** integer, never negative. The single place that decrements it is the sale-recording pure function in `lib/db/` (called by both the cash flow in Phase 4 and the M-Pesa completion flow in Phase 8) — do not duplicate the decrement logic in the webhook handler.
- **`ProductGuess` / `StockUpdate`:** defined once in `lib/ai/types.ts`; both provider files (`hosted.ts`, `selfhosted.ts`) normalize into these exact shapes. No caller inspects a provider-specific response shape.

## 5. Security rules (non-negotiable)

1. **No server-side identity to resolve** — per ADR-2 there is no server session. Do not build one. Instead: **every Convex function that reads or writes shop-scoped data takes `shopId: v.string()` as an explicit argument and filters/indexes on it.** There is no ambient "current user" on the server; passing the wrong or a guessed `shopId` is the accepted MVP risk recorded as `DEBT(prudent-deliberate)` in ARCHITECTURE.md ADR-2 — do not silently "fix" this by adding auth in a phase that doesn't call for it.
2. **Least exposure:** Convex functions not meant to be called from a Next.js route are not exported from files under `convex/` that the client could reach — but since ADR-1 keeps Convex behind Next.js API routes (no client-side Convex SDK), this mainly means: don't add `"use client"` Convex hooks anywhere in Phases 1–10 without a documented ADR update.
3. **Inbound webhooks:** `/api/webhooks/paystack` verifies the `x-paystack-signature` header (HMAC-SHA512 over the **raw, unparsed** request body, using `PAYSTACK_SECRET_KEY`) before trusting any payload field. Respond `200` fast; do the Convex mutation call synchronously only if it's fast, otherwise acknowledge and let a background step finish it — do not let Paystack's retry policy cause duplicate stock decrements (make the completion mutation idempotent on `reference`).
4. **Never trust client-supplied amounts.** `totalKES` for a Paystack charge is recomputed server-side in the `/api/checkout` route from the local cart the client sent as product IDs + quantities, priced against... there is no server-side product catalog in this MVP (products live in Dexie/Convex per shop, not a global catalog) — so the route recomputes `totalKES` from the `shopId`-scoped Convex product records it just synced, never from a client-sent price field. If Convex doesn't yet have the current price (offline edit not yet synced), the charge is rejected with a clear "sync before charging" error rather than trusting the client's number.
5. Secrets (`GEMINI_API_KEY`, `PAYSTACK_SECRET_KEY`, `CONVEX_DEPLOY_KEY` if used) only in environment configuration; never in code, never logged, never sent to the client bundle. `NEXT_PUBLIC_CONVEX_URL` is the only Convex-related value that is public, and it is not a secret (it's a routing address, not a credential) per ADR-1's no-client-SDK design — it's only consumed server-side by Next.js API routes in this project, but is safe to expose if that ever changes.
6. PIN is hashed on-device before storage (see Phase 2 for the exact primitive) — never stored or transmitted in plaintext, never sent to any server (there is no server to send it to, per ADR-2).

## 6. Stack-specific conventions

- **Framework:** Next.js 16, App Router, TypeScript strict, Tailwind v4. This Next.js major has breaking changes from older docs/training data — check `node_modules/next/dist/docs/` for anything unfamiliar before assuming an API.
- **Local storage:** Dexie.js schema lives in `src/lib/db/schema.ts`; all reads happen through `useLiveQuery` (`dexie-react-hooks`) per ADR-5, never a one-off `db.table.get()` inside a component when the value should stay reactive.
- **Backend:** Convex (ADR-1). Schema in `convex/schema.ts` via `defineSchema`/`defineTable`. Next.js Route Handlers call it via `fetchQuery`/`fetchMutation`/`fetchAction` from `convex/nextjs`, using `NEXT_PUBLIC_CONVEX_URL`. Only Convex **queries** may be called from a GET route handler or Server Component (no side effects on GET, to avoid CSRF exposure); mutations/actions are only called from POST/PUT route handlers or Server Actions.
- **Service worker:** Serwist (`@serwist/next`), not `next-pwa` (ADR-4). Precache the app shell; runtime-cache nothing that touches secrets or per-shop data beyond what Dexie already holds.
- **i18n:** `next-intl`, `localePrefix: 'never'` with cookie-based locale (ADR-6). Static UI strings only live in message catalogs; AI-generated text (Gemma responses) is never pre-translated or pushed through the message catalog.
- **API routes:** all live under `src/app/api/*/route.ts`. Every route validates its input shape (zod or equivalent) before touching `lib/` — do not let an untyped `req.json()` reach business logic.

## 7. Code style

- TypeScript strict mode. No `any`, no untyped escape hatches — if a third-party type is missing, write a minimal local `.d.ts`, don't cast to `any`.
- Comments capture *why* and *constraints* (units, invariants, edge-case policy) — never what the next line does.
- No debug noise in committed code. `console.warn`/`console.error` only for genuine operational events (e.g., "sync failed, will retry"), never leftover `console.log` debugging.

## 8. Testing protocol (after every change — not optional)

| Layer | Tool | Covers | Command |
|---|---|---|---|
| Pure logic | Vitest | `src/lib/**` (db helpers, identity, ai types/normalization, payments math, sync merge logic) | `npm run test:unit` |
| Components | Vitest + Testing Library | React components/pages under `src/` | `npm run test:unit` |
| Convex functions | Convex test tooling (`convex-test`) or Vitest against a local Convex dev deployment, introduced in Phase 5 | `convex/**` | `npm run test:convex` |
| API routes | Vitest, mocking `fetch` to Convex and to external providers (Gemini, Paystack) at the network seam | `src/app/api/**/route.ts` | `npm run test:unit` |
| E2E journeys | Playwright | Full browser journeys against `next dev` (offline toggling via Playwright's `context.setOffline()`) | `npx playwright test` |

- Every mutation/endpoint gets: a happy-path test, a wrong-`shopId`-scope test (where applicable), and one test per edge case its phase file lists.
- **DAMP style:** each test self-contained — its own setup values inline, no shared fixture constants for domain values. Only technical boilerplate (mock client builders, MSW server setup) may live in a shared helper.
- Test at the lowest layer that proves the behavior. A phase is not done with failing or skipped tests.
- Mock at the network seam (MSW for `fetch` calls to Gemini/Paystack; a mock Convex client for `fetchQuery`/`fetchMutation`), never mock your own `lib/` functions from within their own tests.

## 9. Technical debt

Reckless debt is forbidden. If a real constraint forces a shortcut, it must carry an inline comment at the site:
```
// DEBT(prudent-deliberate): <what the compromise is> — <why now> — <remediation path>
```
…and an entry in the phase's `overview.md` under "Known Debt." ADR-2's `shopId`-as-tenant-key is the one pre-approved debt item every phase touching Convex will reference — do not re-litigate it, do not add a second, undocumented one for the same concern.

## 10. Environment variable registry

| Variable | Where set | Introduced | Purpose |
|---|---|---|---|
| `NEXT_PUBLIC_CONVEX_URL` | Vercel env / `.env.local` | Phase 5 | Convex deployment URL, used server-side by Next.js routes to call `fetchQuery`/`fetchMutation`/`fetchAction` |
| `CONVEX_DEPLOY_KEY` | Vercel env (build-time) | Phase 5 | Deploys Convex functions as part of CI/build if using `npx convex deploy` in the build step |
| `GEMINI_API_KEY` | Vercel env / `.env.local` | Phase 6 | Server-side auth for Google AI Studio / Gemini API calls (`@google/genai`), never exposed to client |
| `AI_PROVIDER` | Vercel env / `.env.local` | Phase 6 | `hosted` or `selfhosted` — selects the active `lib/ai/providers/*` implementation |
| `SELFHOSTED_AI_URL` | Vercel env / `.env.local` | Phase 6 (stubbed), used if `AI_PROVIDER=selfhosted` | Base URL of the RunPod/FastAPI fallback endpoint |
| `PAYSTACK_SECRET_KEY` | Vercel env / `.env.local` | Phase 8 | Server-side Bearer auth for Paystack Charge API and webhook signature verification |
| `PAYSTACK_PUBLIC_KEY` | Vercel env / `.env.local` | Phase 8 | Only used if any client-side Paystack widget is added; otherwise unused (STK push is server-initiated) |

Keep `.env.example` in sync (names only, never values) — update it in the same phase that introduces each variable.

## 11. Git & increments

- Small, single-purpose commits. Refactoring commits never mix with feature commits; refactoring is behavior-preserving under green tests.
- One phase = one or more commits, but never a commit spanning two phases' concerns.

## 12. Definition of Done — every phase

1. All deliverables exist and behave per the phase file.
2. All required tests written and green; `npm run lint` and `npm run build` (which runs the TypeScript check) clean.
3. No debug noise; no unrecorded debt; `PRD.md`/`ARCHITECTURE.md` updated if the phase legitimately changed a contract (rare — most contract decisions are already captured in ADRs).
4. The phase's `overview.md` filled in completely, including manual test steps a human can follow cold.
