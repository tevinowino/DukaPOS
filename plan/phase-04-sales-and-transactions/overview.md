# Phase 4 — Overview (completed by the implementing agent)

## Status

- [x] All deliverables built
- [x] All required tests green
- [x] Lint + typecheck clean
- Completed on: `2026-07-21`

## What Was Built

- `src/lib/db/schema.ts` (modified) — `Transaction` gained `productName` (snapshot) and `saleGroupId` (multi-item sale grouping); `version(3)` migration re-indexes `transactions` on `saleGroupId`.
- `src/lib/db/transactions.ts` — `deductStock`, `recordCashSale`, `listTransactions`, and `groupTransactionsBySale` (pure presentation-grouping helper, not in the original deliverable list but needed to keep the transactions page thin — see Design Decisions).
- `src/components/ProductPicker.tsx` — searchable product list reusing `products.inStock`/`products.outOfStock` message keys rather than duplicating them.
- `src/app/[locale]/sell/page.tsx` — multi-line sale builder, running total, cash-only payment selector (M-Pesa shown-but-disabled).
- `src/app/[locale]/transactions/page.tsx` — daily log grouped by sale, prev/next day navigation.
- `src/components/ShellHome.tsx` (modified) — added "New sale" and "Sales log" links (alongside Phase 3's "View stock") — the home screen is now the actual navigation hub.
- `messages/en.json`, `messages/sw.json` (extended) — `sell`, `transactions` namespaces, plus three new `shell` keys.
- Tests: `src/lib/db/transactions.test.ts`, `src/components/ProductPicker.test.tsx`, `src/app/[locale]/sell/page.test.tsx`, extended `src/lib/db/schema.test.ts` with a `version(3)` migration test.
- `e2e/sales-flow.spec.ts` — full seed-product → sell → verify-stock → verify-log journey.

## Design Decisions & Rationale

**(a) Final `Transaction` shape** (`src/lib/db/schema.ts`, verbatim):
```ts
export interface Transaction {
  id: string;
  productId: string;
  productName: string;   // snapshot at sale time
  quantity: number;
  totalKES: number;      // whole KES, integer
  paymentMethod: "cash" | "mpesa";
  status: "completed" | "pending" | "failed";
  createdAt: number;     // epoch ms
  saleGroupId: string;   // shared across every line of one sale
}
```
`saleGroupId` is **required on every row**, including single-item sales — `recordCashSale` always generates one `crypto.randomUUID()` per call and stamps every line with it, so there's no optional-field ambiguity for Phase 5's Convex schema to mirror.

**(b) Multi-item sale OVERRIDE (confirmed, matches the phase file's anticipated decision):** one `Transaction` row per product line, grouped for display via `saleGroupId` + shared `createdAt`. The transactions page groups rows by `saleGroupId` (via `groupTransactionsBySale`, sorted newest-first) and shows one card per sale with a summed total and one line per product underneath.

**(c) Oversell UX:** a **soft warning, not a hard block**. If a line's quantity exceeds the product's current `stockQty`, the sell page shows "Only N left" under that line but the Confirm button stays enabled — `deductStock`'s clamp-at-zero is the actual safety net (stock never goes negative regardless of what was requested). Chosen because real shops legitimately oversell against incoming stock sometimes; blocking the sale outright would be more restrictive than the phase file's edge-case table required.

**(d) M-Pesa payment option: visible-but-disabled, not hidden.** The sell page shows both "Cash" (active, styled as selected — there's only one real option so no click handler is needed yet) and "M-Pesa (coming soon)" (`aria-disabled`, non-interactive styling) side by side. Chosen over hiding it entirely so the shopkeeper sees the feature exists and is coming, per the phase file's explicit either/or allowance.

**(e) `groupTransactionsBySale` added as a small pure function**, not originally named in the deliverables table, because grouping-by-`saleGroupId` is genuine domain logic (global-rules §2: pure logic lives in pure functions) that both the transactions page needs and that a future phase (or a "today's summary" feature) could reuse — keeping it in `transactions.ts` next to the functions that produce the data avoids duplicating the grouping logic inline in the page component.

## Deviations from Requirements

None beyond the additions noted above (`groupTransactionsBySale`, and reusing `products.inStock`/`outOfStock` message keys in `ProductPicker` instead of a separate `productPicker` namespace) — both are extensions within the spirit of the phase file, not contradictions of it.

## Issues Encountered & How They Were Fixed

None specific to this phase — no dev-tooling surprises this time (Phase 3's `next dev`→production-build E2E fix and the Testing Library cleanup fix from Phases 2/3 already covered the classes of issue that would have bitten here).

## Tests Written

- `src/lib/db/schema.test.ts` (extended): a `version(2)`-shaped database with an existing transaction row, reopened against `version(3)`, still contains that row and is queryable by the new `saleGroupId` index.
- `src/lib/db/transactions.test.ts`: `recordCashSale` deducts stock and records a matching completed cash transaction; a multi-item sale produces correct per-line totals, correct stock for both products, and a shared `saleGroupId`; `deductStock` clamps at zero; two sequential sales of the same product both apply independently; `listTransactions` returns only today's rows when a transaction from yesterday is also seeded; `groupTransactionsBySale` groups multi-line sales, sums totals, and sorts newest-first.
- `src/components/ProductPicker.test.tsx`: typing a search term filters the visible list; a zero-stock product shows an "Out of stock" indicator rather than being hidden.
- `src/app/[locale]/sell/page.test.tsx`: the confirm button is disabled with zero line items; adding two products and confirming calls `recordCashSale` (spied, not deep-mocked) with exactly those two line items.
- `e2e/sales-flow.spec.ts`: from an unlocked app, add a product via the real Phase 3 UI, record a 3-unit cash sale via the real Phase 4 UI, confirm the transaction log shows "Sugar 1kg × 3" and the correct total, confirm the products list shows stock reduced from 10 to 7.

## How to Run Automated Tests

```bash
npm run test:unit
npm run test:e2e
```

## How to Manually Verify This Phase

1. With at least one product in stock, click "New sale" from the home screen.
2. Add it as a line item, adjust the quantity, confirm the running total updates.
3. Click "Confirm sale" — confirmed: redirected to the transactions log, the sale appears grouped with the correct time, product, quantity, and total.
4. Navigate to the products list — confirmed: stock reduced by exactly the sold quantity.
5. Add a second line item exceeding current stock (e.g. quantity 999) — confirmed: a soft "Only N left" warning appears, but Confirm remains clickable; after confirming, stock clamps to 0 rather than going negative.
6. Navigate the transactions log to a day with no sales (Previous/Next) — confirmed: the empty state renders, not an error.

## Known Debt

None beyond the Swahili-native-review item carried forward from Phases 1–3 (this phase's `sell`/`transactions` namespaces and three new `shell` keys are added to that same list — see Handoff Notes).

## Handoff Notes for Phase 5

- Final `Transaction` shape is pasted verbatim above — Convex's `transactions` table schema should mirror it exactly, plus `shopId` per global-rules §5.1.
- `deductStock`'s clamp-at-zero logic (`Math.max(0, product.stockQty - quantity)`) needs to be **mirrored, not imported**, into the Convex mutation Phase 5/8 write for the M-Pesa completion path — Convex functions can't import this Dexie-bound module. Keep the two implementations' behavior identical.
- Confirmed (per Phase 3's handoff question): `SyncQueue` entries are **still not written** by any write path as of this phase — `addProduct`/`updateProduct`/`deleteProduct` (Phase 1/3) and `recordCashSale`/`deductStock` (this phase) all only touch Dexie. Phase 5 is retrofitting `enqueue` calls into all of these from a clean slate, not just some of them.
- `AppLockGate`'s in-memory unlock state still applies — any Phase 5 UI (e.g. a sync-status indicator) that needs E2E coverage must be reached via client-side navigation from an already-unlocked page, never `page.goto()` mid-test.
- The `sell`/`transactions` message namespaces and `shell.newSaleButton`/`viewStockButton`/`viewSalesButton` keys are added to the running Swahili-review debt list — Phase 9 reviews all of it together.
