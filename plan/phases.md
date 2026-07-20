# DukaPOS — Master Phase Plan

DukaPOS is an offline-first Progressive Web App that lets a small Kenyan shop owner track inventory and record sales from their phone — barcode scan, Gemma 4 photo ID, or manual entry for unbarcoded goods — with Gemma 4 also handling natural-language stock updates and plain-language summaries, and M-Pesa collection via Paystack. Full specification lives in [`PRD.md`](../PRD.md) (product scope) and [`ARCHITECTURE.md`](../ARCHITECTURE.md) (technical design, including the Architecture Decision Records in §9 that resolve every ambiguity found while writing this plan).

This plan turns that specification into 10 sequential, independently verifiable implementation phases.

## How to work this plan (read this first, every session)

You are the implementing agent. Your workflow for any phase N:

1. Read [`plan/global-rules.md`](./global-rules.md) in full. It is binding for every phase.
2. Read `plan/phase-N-*/requirements-and-rules.md` in full, plus every file its "Read First" section lists.
3. Read the `overview.md` of the **previous** phase — it contains handoff notes you need.
4. Implement the steps **in the order given**. Do not reorder, do not skip, do not "improve" the sequence.
5. Write the tests the phase requires **as you build each piece**, not at the end.
6. When everything is done and all tests pass, fill in this phase's `overview.md` completely. An empty or vague overview means the phase is not done.
7. **Never begin phase N+1 until phase N's Definition of Done is fully satisfied and its overview.md is written.**

If a requirement conflicts with something you discover (a library constraint, an API reality), do not silently deviate: implement the closest safe alternative and document the deviation prominently in `overview.md` under "Deviations."

## Folder map

```
plan/
├── phases.md                                    (this file)
├── global-rules.md
├── phase-01-foundation-and-local-data/
├── phase-02-pin-lock-and-shop-identity/
├── phase-03-product-management/
├── phase-04-sales-and-transactions/
├── phase-05-convex-sync-backend/
├── phase-06-gemma-vision-product-id/
├── phase-07-gemma-text-parsing-and-summaries/
├── phase-08-paystack-mpesa-payments/
├── phase-09-localization-and-pwa-polish/
└── phase-10-hardening-and-launch/
    each containing requirements-and-rules.md + overview.md
```

## The phases

| # | Phase | Goal | Depends on |
|---|-------|------|-----------|
| 1 | **Foundation & Local Data Layer** | Test tooling (Vitest, Testing Library, Playwright) installed; Dexie schema (Product, Transaction, SyncQueue) live; PWA shell (Serwist) and app layout scaffolded; next-intl wired with `en`/`sw` message catalogs (`sw` may still be English placeholder text — real translation is Phase 9) | — |
| 2 | **PIN Lock & Shop Identity** | Local device PIN lock (ADR-2) gates the app; `shopId` generated and persisted; shop profile (name, phone) captured | 1 |
| 3 | **Product Management** | Manual add/edit/delete, barcode scan (`BarcodeDetector` + `@zxing/browser` fallback), stock list — all local-first, no AI or backend yet | 1, 2 |
| 4 | **Sales & Transactions (cash)** | Record a cash sale, deduct stock, quantity adjustments, daily transaction log — payment method field exists but only `cash` is reachable until Phase 8 | 3 |
| 5 | **Convex Sync Backend** | Convex schema + functions mirroring Product/Transaction; `/api/sync` drains `SyncQueue`; background sync on reconnect; this phase's queue-draining engine is what Phases 6–8 hook into for anything created/queued offline | 1–4 |
| 6 | **Gemma 4 Vision — Photo Product ID** | `lib/ai/` adapter (`gemmaClient.ts`, `types.ts`, `providers/hosted.ts`, `providers/selfhosted.ts` stub); `/api/identify-product`; camera capture → confirm/edit → save flow | 3, 5 |
| 7 | **Gemma 4 Text — Parsing & Summaries** | `/api/parse-stock` (NL stock updates, EN/SW/mixed) and `/api/summary` (plain-language end-of-day summary); extends the Phase 6 `lib/ai/` files, does not fork them | 4, 6 |
| 8 | **Paystack M-Pesa Payments** ⚠️ highest risk — real money | `/api/checkout` (STK push via Charge API), `/api/webhooks/paystack` (signature-verified), `/api/checkout/status` (poll target per ADR-3), pending→completed transaction flow with idempotent stock deduction | 4, 5 |
| 9 | **Localization & PWA Polish** | Real Swahili translations (native-reviewed copy, not machine-translated per PRD §9 risk), install prompt, offline UX polish, icon/manifest finalization | 1, 3, 4 |
| 10 | **Hardening & Launch** | E2E journeys (Playwright) across the full app, `shopId`-scoping security audit with a written report, performance verification against PRD §6's targets, deployment runbook | all |

### Dependency notes

- Phases 1→2→3→4 are **strictly serial** — each is a prerequisite for the next and touches overlapping files (layout, Dexie schema).
- Phase 5 (Convex) must land **before** Phase 8 (Paystack): the M-Pesa webhook needs a server-reachable data store to write "payment completed" into, since a webhook cannot reach into a specific browser's IndexedDB (this is exactly the gap ADR-3 closes). Building Paystack before Convex would mean building it twice.
- Phase 7 depends on Phase 6 not because the features are coupled, but because both extend the same `lib/ai/gemmaClient.ts` / `types.ts` files — doing them in the same sequence avoids one agent's work clobbering the other's scaffold. If ever split across two agents, Phase 6 must land and freeze the `lib/ai/types.ts` shape first.
- Phase 9 (localization/polish) is **parallel-safe** with Phase 8 (Paystack) — disjoint files (message catalogs/manifest vs. payment routes) — but this plan runs them serially since one agent executes the whole plan.
- **Phase 8 is the highest-risk phase.** It moves real money (even in sandbox mode, the flow must be correct before any live-mode cutover post-hackathon). Work slowly, follow its "Research-verified facts" block exactly, and do not guess at Paystack payload shapes not covered there — verify against `https://paystack.com/docs/api/charge/` directly if anything is unclear.
- Phase 10 is always last and depends on everything.

## Source-of-truth hierarchy

When documents disagree, resolve in this order (highest wins):

1. The phase's `requirements-and-rules.md` (they contain deliberate architect overrides of the older docs, marked **OVERRIDE**)
2. `plan/global-rules.md`
3. `ARCHITECTURE.md` §9 (Architecture Decision Records) — these already resolve the ambiguities found in the original draft
4. `PRD.md` / `ARCHITECTURE.md` (remaining sections)

Every override a phase file makes beyond what's already in the ADRs is called out explicitly with the word **OVERRIDE** so you can tell design intent from accident.
