# Phase 4 — Sales & Transactions (cash): record a sale, deduct stock, daily log

> Audience: implementing AI agent. Read [`plan/global-rules.md`](../global-rules.md) and Phase 3's `overview.md` first. Follow the steps in order.

## 1. Objective

When this phase is done: a shopkeeper can select one or more products, adjust quantities, record a cash sale, see stock deducted immediately, and view a daily transaction log. `paymentMethod` exists as a field and a UI choice, but selecting "M-Pesa" in this phase either is hidden/disabled or clearly marked "coming soon" — the M-Pesa path isn't wired to anything until Phase 8. This phase establishes the one true stock-decrement function that Phase 8's webhook flow will also call.

## 2. Read First

- `PRD.md` §5 "Sales & Transactions"
- `ARCHITECTURE.md` §4.5 (`Transaction` shape: `id, productId, quantity, totalKES, paymentMethod, status, createdAt`)
- Phase 3 `overview.md` — final `Product` shape and `updateProduct` signature

## 3. Deliverables

| Path | Purpose |
|---|---|
| `src/lib/db/transactions.ts` | Pure functions: `recordCashSale(items)`, `listTransactions({ date? })`, plus the shared `deductStock(productId, quantity)` helper both this phase and Phase 8 call |
| `src/app/[locale]/sell/page.tsx` | Sale flow: pick product(s) from stock, set quantity per line, see running total, confirm sale |
| `src/app/[locale]/transactions/page.tsx` | Daily transaction log — defaults to today, simple date picker/back-forward for prior days |
| `src/components/ProductPicker.tsx` | Search/select UI over the live product list, reused by the sale flow |

## 4. Implementation Steps (in order)

1. **Design `recordCashSale` as one deep entry point.** Signature: `recordCashSale(items: { productId: string; quantity: number }[]): Promise<Transaction[]>` (one shop's sale can include multiple distinct products; if `ARCHITECTURE.md`'s one-`productId`-per-`Transaction` shape is kept, this OVERRIDE decision is: **one `Transaction` row per product line**, all sharing a synthesized common `createdAt` timestamp and a client-generated `saleId` grouping key if the daily log needs to visually group multi-item sales — add a `saleGroupId` field to `Transaction` if so, and document it as an OVERRIDE with one line of why (ARCHITECTURE.md's schema didn't anticipate multi-item sales explicitly, but PRD §5 says "select item(s)")). Do not implement this as `startSale()` + `addLineItem()` + `finalizeSale()` called separately from the component — the whole multi-line sale is submitted as one call.
2. **Implement `deductStock`** as the single function that decrements a `Product.stockQty`, clamped at zero, never going negative (see edge cases). This exact function is what Phase 8's webhook-driven completion path will also call — write it now to be reusable outside a browser event handler (no DOM/React imports).
3. **Implement `recordCashSale`** using `deductStock` for each line item, then writing one `Transaction` row per line with `paymentMethod: 'cash'`, `status: 'completed'` (cash is settled instantly, unlike the M-Pesa `pending` state Phase 8 introduces).
4. **Implement `listTransactions({ date })`**, defaulting to "today" in the shop's local time zone if no date is passed.
5. **Build `ProductPicker.tsx`** — a searchable list (filter by name as you type) over `useLiveQuery(() => listProducts())`, showing available stock so a shopkeeper can't blindly pick more than what's on hand (soft warning, not necessarily a hard block — see edge cases).
6. **Build the sell page.** Add product lines via `ProductPicker`, adjust quantity per line (with a visible running total in KES), a `paymentMethod` selector where `cash` is the only enabled option (`mpesa` visible-but-disabled with a short "available soon" note is fine, or hidden entirely — your call, document which in `overview.md`), and a confirm action calling `recordCashSale`.
7. **Build the transactions page** listing today's completed sales with product name, quantity, total, time — plus simple prev/next day navigation.
8. **Verify:** record a multi-item cash sale, confirm stock deducted correctly for each product, confirm the transaction log shows it.

## 5. Edge Cases & Required Handling

| Edge case | Required handling |
|---|---|
| Sale quantity exceeds current `stockQty` | `deductStock` clamps to zero rather than going negative, but the sell page should warn *before* confirming ("only 3 left") rather than silently letting the shopkeeper oversell — a soft warning that still permits confirming (real shops sometimes sell against incoming stock) is acceptable; document the exact UX chosen. Test `deductStock`'s clamping at the function level regardless of UI behavior. |
| Sale with zero line items confirmed | Confirm action is disabled/no-ops until at least one line item with quantity ≥ 1 exists. Test it. |
| Two sales of the same product recorded in quick succession | Each call to `recordCashSale` reads current stock and decrements independently — no lost-update race within a single-tab, single-device app (Dexie transactions are serialized per browser tab, which is sufficient here; do not add cross-tab locking, out of scope). Test it by calling `recordCashSale` twice sequentially for the same product and asserting both decrements applied. |
| Viewing the transaction log for a date with zero sales | Empty state, not an error. Test it. |
| A `Transaction` referencing a product later deleted (from Phase 3's edge case) | The log renders using whatever product-identifying info the `Transaction` row itself stores (do not join against the live `products` table for display — store the product name at time of sale on the `Transaction` row itself, e.g. `productName`, precisely so deletion doesn't break history; if Phase 1/3 didn't already include this field, add it now and note the schema addition). Test it: create a transaction, delete its product, confirm the log entry still renders the product name correctly. |

## 6. Required Tests

- `src/lib/db/transactions.test.ts`: `recordCashSale([{productId, quantity: 2}])` against a seeded product with `stockQty: 10, priceKES: 100` results in the product's `stockQty` becoming `8` and a `Transaction` with `totalKES: 200, paymentMethod: 'cash', status: 'completed'`; a multi-item call (`[{productA, qty:1}, {productB, qty:3}]`) produces the correct number of `Transaction` rows with correct per-line totals and both products' stock decremented correctly; `deductStock` called with a quantity greater than current stock clamps `stockQty` to `0`, never negative; two sequential `recordCashSale` calls for the same product both apply their decrements (not overwriting each other); `listTransactions({date: 'today'})` returns only today's rows when a transaction from a different date is also seeded.
- `src/components/ProductPicker.test.tsx`: typing a search term filters the visible list to matching product names; a product with `stockQty: 0` is visually distinguishable (not hidden — a shopkeeper might still want to see it's out) — assert the "out of stock" indicator renders.
- `src/app/[locale]/sell/page.test.tsx`: adding two product lines and confirming calls `recordCashSale` with exactly those two line items; the confirm control is disabled with zero line items.
- `e2e/sales-flow.spec.ts` (Playwright): from an unlocked app with a seeded product (add it via the Phase 3 UI within the test, or via a test-only seed hook if one already exists — do not reach into IndexedDB via `page.evaluate` unless nothing else is feasible, and document which approach you used), record a cash sale, confirm the products list shows reduced stock, confirm the transactions page shows the new entry.

## 7. Phase Rules

- `paymentMethod: 'mpesa'` is never actually selectable-and-functional in this phase — Phase 8 wires it. Do not build a fake/stub checkout screen; either hide the option or mark it clearly disabled.
- `deductStock` and `recordCashSale` must have zero React/Next.js imports — Phase 8's webhook completion path calls `deductStock` from a Next.js API route context (indirectly, after a sync from Convex — see Phase 5/8), so it must be safely importable there too. Actually confirm during Phase 8 whether the API route path needs a server-side equivalent of this Dexie function (it does not — API routes run server-side and have no access to the browser's Dexie database at all; `deductStock`'s *logic* (clamp-at-zero) should be mirrored in the equivalent Convex mutation Phase 5/8 write, not literally imported, since Convex functions can't import browser-only Dexie code either). Note this clearly in `overview.md` so Phase 5/8 don't get confused about what's shared vs. mirrored.
- No date-range reporting, no CSV export, no analytics beyond the daily log — PRD §4 explicitly places "Analytics dashboards beyond basic summaries" out of scope.

## 8. Definition of Done

1. A human can, with at least one product in stock: open the sell flow, add it as a line item with a quantity, confirm a cash sale, see stock reduced on the products page, and see the sale in today's transaction log.
2. All §6 tests green; `npm run lint` and `npm run build` clean.
3. `overview.md` completed, including: the final `Transaction` shape (confirm whether `saleGroupId`/`productName` fields were added, per §4 step 1 and §5's last row) pasted verbatim — Phase 5's Convex schema mirrors this exactly, and Phase 8 extends the same shape for the `pending`/M-Pesa path.
