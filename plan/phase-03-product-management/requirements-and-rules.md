# Phase 3 — Product Management: manual add/edit/delete, barcode scanning, stock list

> Audience: implementing AI agent. Read [`plan/global-rules.md`](../global-rules.md) and Phase 2's `overview.md` first. Follow the steps in order.

## 1. Objective

When this phase is done: a shopkeeper (already past the PIN lock) can view their current stock list, add a product manually, add a product by scanning its barcode, and edit or delete an existing product — all fully functional offline, all reflected instantly via `useLiveQuery` since Dexie is the sole source of truth this phase. No AI, no backend sync, no sales flow yet.

## 2. Read First

- `PRD.md` §5 "Inventory & Product Management" and §6 (one-handed use, large tap targets, icon-first nav)
- `ARCHITECTURE.md` §4.1 ("native `BarcodeDetector` API with `@zxing/browser` fallback") and §4.5 (`Product` shape)
- Phase 1 `overview.md` (final `Product` type, `addProduct`/`updateProduct`/`deleteProduct`/`listProducts` signatures) and Phase 2 `overview.md` (confirm lock gating so you know these routes render only when unlocked)

## 3. Deliverables

| Path | Purpose |
|---|---|
| `src/app/[locale]/products/page.tsx` | Stock list — `useLiveQuery(() => listProducts())`, shows name, stock qty, price; large tap targets per PRD §6 |
| `src/app/[locale]/products/new/page.tsx` | Manual add form |
| `src/app/[locale]/products/[id]/edit/page.tsx` | Edit form, pre-filled; includes delete action |
| `src/components/BarcodeScanner.tsx` | Camera-based scanner: tries `BarcodeDetector` first, falls back to `@zxing/browser` if unsupported; emits a decoded barcode string via `onDetect` |
| `src/components/ProductForm.tsx` | Shared form UI for both add and edit (fields: name, category, barcode (optional), `priceKES`, `stockQty`) — one component, not duplicated markup |
| `src/lib/db/products.ts` (extended from Phase 1) | Add `getProductByBarcode(barcode)` used by the scan flow to detect "this barcode already exists — edit instead of duplicate-adding" |

## 4. Implementation Steps (in order)

1. **Install `@zxing/browser`** (`npm install @zxing/browser`) as the fallback scanning path — `BarcodeDetector` has real-world support gaps (notably no Safari/Firefox support as of current data), so the fallback is not optional polish, it's required for the app to work on a meaningful share of shopkeepers' phones.
2. **Write `getProductByBarcode`** in `src/lib/db/products.ts`, doc-comment first. Returns the matching `Product` or `undefined`.
3. **Build `BarcodeScanner.tsx`.** On mount, feature-detect `'BarcodeDetector' in window`; if present, use it against a `<video>` stream from `getUserMedia`; if absent, initialize `@zxing/browser`'s reader against the same video element. Debounce/dedupe so a held-steady barcode doesn't fire `onDetect` dozens of times per second — fire once, then require the camera to lose and reacquire a code (or a short cooldown) before firing again. Handle camera-permission-denied with a visible message and a manual-entry fallback link (not a dead end).
4. **Build `ProductForm.tsx`.** Client-side validation: `name` required, `priceKES` a non-negative integer, `stockQty` a non-negative integer, `barcode` optional but if present must be a plausible digit string. Reuse for both add and edit via a mode prop (`mode: 'create' | 'edit'`) and an optional initial value — this is UI reuse, not the "temporal decomposition" global-rules §2 forbids, since it's one form component, not a multi-step public API.
5. **Build the products list page** with `useLiveQuery`. Empty state (no products yet) shows a clear call-to-action to add the first product, not a blank screen.
6. **Build the add flow**, offering both entry points: a "scan barcode" button that opens `BarcodeScanner` and pre-fills the barcode field on detect, and a plain "add manually" path that skips scanning. On barcode detect, call `getProductByBarcode` first — if a match exists, route to that product's edit page instead of letting the shopkeeper create a duplicate (surface this clearly: "This barcode is already Sugar 1kg — edit it?").
7. **Build the edit flow** with a destructive-but-confirmed delete action (a confirmation step/dialog — no silent instant deletes).
8. **Verify:** add a product manually, add one via a real or simulated barcode scan, edit stock quantity, delete a product — confirm the list updates live in each case without a manual refresh.

## 5. Edge Cases & Required Handling

| Edge case | Required handling |
|---|---|
| Scanning a barcode that already exists in the local `products` table | Route to editing the existing product instead of creating a duplicate (see step 6). Test it. |
| Camera permission denied | `BarcodeScanner` shows a clear message and a link/button to switch to manual entry — never a silent blank camera view. Test it (mock `getUserMedia` rejecting). |
| Neither `BarcodeDetector` nor a working camera is available (e.g. running the E2E suite / desktop without a webcam) | The manual-entry path is always reachable independent of camera state — it's not nested inside the scanner flow. Test it via Playwright by never granting camera permission and confirming manual add still works end-to-end. |
| Form submitted with `priceKES` or `stockQty` as a negative number or non-integer (e.g. typed `"12.5"` or `"-3"`) | Client-side validation blocks submission with a visible error; `addProduct`/`updateProduct` are never called with invalid values. Test it at the form level. |
| Editing a product's `stockQty` directly (not via a sale) | Allowed — this is a manual stock correction path (e.g. after a physical stocktake), not restricted to Phase 4's sale-driven decrement. Test it. |
| Deleting a product that has existing `Transaction` rows referencing it | For this MVP, deletion is allowed and the product simply disappears from the list; historical transactions keep their stored `productId`/name snapshot (confirm Phase 1's `Transaction` shape stores enough product info to still display sensibly after deletion — if it only stores `productId`, note this as a gap to flag, don't silently leave the daily log showing a broken reference). Test that a transaction log entry for a since-deleted product still renders without crashing. |

## 6. Required Tests

- `src/lib/db/products.test.ts` (extended): `getProductByBarcode("6009123456789")` returns the matching product after `addProduct` created it with that barcode; returns `undefined` for a barcode nothing was saved with.
- `src/components/ProductForm.test.tsx`: submitting with all valid fields (`name: "Cooking Oil 1L"`, `priceKES: 320`, `stockQty: 15`) calls the submit handler with exactly those normalized values; submitting with `priceKES: "-5"` shows a validation error and does not call the submit handler; submitting with empty `name` shows a validation error and does not call the submit handler; edit mode pre-fills all fields from the provided initial product.
- `src/components/BarcodeScanner.test.tsx`: with `getUserMedia` mocked to reject, the component renders the permission-denied message and a manual-entry affordance, and never calls `onDetect`.
- `src/app/[locale]/products/page.test.tsx` (Testing Library, seeded fake IndexedDB): with two seeded products, both render with name and stock qty visible; with zero products, the empty-state call-to-action renders instead.
- `e2e/product-management.spec.ts` (Playwright, no camera permission granted): from the locked-then-unlocked app, navigate to products, add a product manually with concrete values, confirm it appears in the list; edit its stock quantity, confirm the new value shows; delete it, confirm it's gone from the list.

## 7. Phase Rules

- No sale-recording UI here — that's Phase 4. The products list is read/manage only.
- No AI-assisted photo product identification here — that's Phase 6. If a "add via photo" button feels tempting to stub in, don't; it belongs to Phase 6's deliverables list, not this one.
- No sync/backend calls — every write in this phase touches Dexie only. `SyncQueue` entries are not yet produced by this phase's writes (Phase 5 retrofits queueing when it builds the sync engine, unless it's cheap to add the queue-entry write now — if you do add it, document that explicitly as a forward-looking deviation in `overview.md`, since the phase file does not require it).
- Barcode dedupe/cooldown logic lives inside `BarcodeScanner`, not duplicated in each page that uses it.

## 8. Definition of Done

1. A human can, from an unlocked app with an empty stock list: add a product manually, see it appear instantly; add a second product via a real barcode scan (or, if testing on a machine without a usable camera, via the manual-entry fallback) and see it appear; edit either product's stock quantity and see the change live; delete a product and see it disappear.
2. All §6 tests green; `npm run lint` and `npm run build` clean.
3. `overview.md` completed, including the final `Product`-facing function signatures (`getProductByBarcode` etc.) and whether `SyncQueue` entries are written yet (see Phase Rules) so Phase 5 knows exactly what it's retrofitting.
