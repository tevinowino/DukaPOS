# Phase 3 — Overview (completed by the implementing agent)

## Status

- [x] All deliverables built
- [x] All required tests green
- [x] Lint + typecheck clean
- Completed on: `2026-07-21`

## What Was Built

- `src/lib/db/products.ts` (extended) — added `getProduct(id)` (not in the original deliverable list, but needed so the edit page doesn't touch raw `db.products` calls, per Phase 1's "centralize in products.ts" principle) and `getProductByBarcode(barcode)`.
- `src/types/barcode-detector.d.ts` — minimal ambient typing for the experimental `BarcodeDetector` API (not in TypeScript's bundled DOM lib).
- `src/components/BarcodeScanner.tsx` — one `getUserMedia` call, then `BarcodeDetector` (native) or `@zxing/browser`'s `decodeFromStream` (fallback) against the same stream/video element; 2s same-code redetect cooldown.
- `src/components/ProductForm.tsx` — shared create/edit form; takes `initialValues?: Partial<ProductFormValues>` rather than a `Product` (see Deviations).
- `src/app/[locale]/products/page.tsx` — live stock list (`useLiveQuery`), empty state, links to add/edit.
- `src/app/[locale]/products/new/page.tsx` — choose scan-or-manual → (scan → duplicate-check → form, or straight to form) → save.
- `src/app/[locale]/products/[id]/edit/page.tsx` — pre-filled form + confirm-gated delete.
- `src/components/ShellHome.tsx` (modified) — added a "View stock" link; this didn't exist before and there was **no way to reach `/products` from the unlocked app at all** (see Issues Encountered).
- `messages/en.json`, `messages/sw.json` (extended) — `scanner`, `products`, `productForm` namespaces, plus `shell.viewStockButton`.
- Tests: `src/lib/db/products.test.ts` (extended), `src/components/ProductForm.test.tsx`, `src/components/BarcodeScanner.test.tsx`, `src/app/[locale]/products/page.test.tsx`.
- `e2e/product-management.spec.ts` — new full manual add/edit/delete journey.
- `playwright.config.ts`, `e2e/app-shell.spec.ts` (modified) — see Deviations; this phase changed the E2E target from `next dev` to a production build.

## Design Decisions & Rationale

**(a) `BarcodeDetector` was not exercised on a real device.** All verification (unit tests, the e2e test) exercises the manual-entry path and the `getUserMedia`-rejected path. No physical camera/barcode was available in this environment. `@zxing/browser`'s `decodeFromStream` path is also unexercised beyond compiling/typechecking — it's wired per the verified API surface (`node_modules/@zxing/browser/**/*.d.ts`) but not run against a live stream. **Flagging clearly for whoever runs the real demo: test barcode scanning on an actual phone before relying on it live.**

**(b) Redetect cooldown:** 2000ms (`REDETECT_COOLDOWN_MS` in `BarcodeScanner.tsx`) — the same decoded code fired again within 2s of the last fire is suppressed. Chosen as a reasonable "still holding the same barcode in frame" window without empirical tuning against a real camera (see (a) — worth revisiting after real-device testing).

**(c) `SyncQueue` entries are NOT written by this phase's writes.** `addProduct`/`updateProduct`/`deleteProduct` (from Phase 1, untouched by this phase except adding `getProduct`/`getProductByBarcode`) still only write to `db.products`, nothing to `db.syncQueue`. Left for Phase 5 to retrofit, per Phase Rules' explicit option to skip it.

## Deviations from Requirements

1. **`ProductForm` takes `initialValues?: Partial<ProductFormValues>`, not `initialProduct?: Product`.** The form doesn't need or want to know about a product's `id` — it only ever emits/consumes form-shaped values. This also let the create flow's barcode-scan entry point reuse the exact same prop (seeding just `{ barcode }`) instead of needing a second, parallel pre-fill mechanism. The required test ("edit mode pre-fills all fields from the provided initial product") is satisfied by passing the product's fields (minus `id`) as `initialValues` — same behavior, cleaner type.

2. **Added `ShellHome`'s "View stock" link and back-navigation links on the products pages — not in this phase's deliverables list, but load-bearing.** Discovered while writing `e2e/product-management.spec.ts`: after Phase 2, the unlocked home screen (`ShellHome`) had *no link to `/products` at all* — the only way to reach the stock list was typing the URL directly, which forces a hard navigation and re-triggers `AppLockGate`'s relock (correct per ADR-2, but means every manual URL visit re-prompts the PIN). This wasn't a bug introduced by this phase, but this phase is the first one that needed the products list to actually be reachable, so it's the one that surfaced and fixed it. Added: `ShellHome` → "View stock" link to `/products`; `/products` → "← Home" link; `/products/new` and `/products/[id]/edit` → "← Back to stock" links.

3. **`playwright.config.ts`'s `webServer` now runs `npm run build && npm run start`, not `npm run dev`.** Phase 1 had switched *to* `npm run dev` (with `--webpack`) specifically for the service-worker e2e test. While building this phase's `e2e/product-management.spec.ts`, a client-side `<Link>` navigation to a route Next's dev server hadn't yet compiled (`/products`, first visit) reliably raced with webpack's Fast Refresh (dev-only hot-reload), which reset the in-flight navigation back to the previous URL — reproduced consistently across multiple runs, confirmed via browser console logging (`[Fast Refresh] rebuilding` / `done in 2376ms` firing exactly around the failed navigation). This is a `next dev`-only artifact, not an app bug. Fixed at the root by pointing E2E at a production build instead (eliminates Fast Refresh entirely, and is arguably the more meaningful E2E target regardless). `npm run build` already uses `--webpack` from Phase 1, so `public/sw.js` is still correctly generated for `next start` to serve — confirmed the service-worker test still passes under this config.

4. **`e2e/app-shell.spec.ts`'s service-worker assertion rewritten using `expect.poll` instead of `page.waitForFunction` + a follow-up `page.evaluate`.** The original two-step version (wait for a condition, then separately re-read the value) intermittently observed the re-read as `undefined`/`false` even immediately after the wait resolved — a real race between the worker's own lifecycle and two separate round-trips into the page. `expect.poll(() => page.evaluate(...)).toBe("activated")` reads and asserts on the same value inside one polling loop, which resolved the flakiness (verified across two full consecutive suite runs).

## Issues Encountered & How They Were Fixed

- **No navigation existed from the home screen to the products list** — see Deviation #2. Found this by trying to write the e2e test, not by inspection; worth remembering that "is X actually reachable through the UI" is exactly the class of gap that doesn't show up in unit tests.
- **`next dev`'s Fast Refresh raced a first-visit client-side `<Link>` navigation** — see Deviation #3. Diagnosed by adding temporary `page.on('console', ...)` logging to the failing test (removed before finalizing), which surfaced the `[Fast Refresh] rebuilding`/`done` messages landing exactly around the failed navigation.
- **Playwright's `getByRole("link", { name: "Add product" })` was ambiguous** on the empty stock list — both the header button and the empty-state call-to-action are simultaneously visible and share the same accessible name. Fixed with `.first()` in the test; this is expected/intentional UI (two entry points to the same action), not a bug to fix in the app.
- **`page.waitForFunction`'s truthy-resolution semantics didn't behave as expected** when checked against a `false`/`"activated"` return value in one attempt — see Deviation #4; resolved by switching to `expect.poll` rather than continuing to debug `waitForFunction`'s exact polling internals.

## Tests Written

- `src/lib/db/products.test.ts` (extended): `getProductByBarcode` returns the matching product after `addProduct` created it with that barcode; returns `undefined` for a barcode nothing was saved with.
- `src/components/ProductForm.test.tsx`: valid submission calls `onSubmit` with exactly the normalized values; negative price shows a validation error and doesn't submit; empty name shows a validation error and doesn't submit; edit mode pre-fills all fields (name, category, barcode, price, stock) from `initialValues` and shows "Save changes" instead of "Save product".
- `src/components/BarcodeScanner.test.tsx`: with `getUserMedia` mocked to reject, the permission-denied message and manual-entry button render, and `onDetect` is never called.
- `src/app/[locale]/products/page.test.tsx`: two seeded products both render with name and stock quantity visible; zero products renders the empty-state call-to-action instead.
- `e2e/product-management.spec.ts`: from an unlocked app (no camera permission granted anywhere in the test), navigate to products via the "View stock" link, add a product manually with concrete values, confirm it appears; edit its stock quantity, confirm the new value shows; delete it (through the confirm dialog), confirm it's gone and the empty state returns.

## How to Run Automated Tests

```bash
npm run test:unit   # Vitest
npm run test:e2e    # Playwright — now builds + starts a production server itself via webServer (see Deviation #3), so the first run takes longer (~30-60s) than a `next dev`-backed suite would
```

## How to Manually Verify This Phase

1. Unlock the app (complete onboarding or enter the PIN), click "View stock" from the home screen — confirm the empty state renders on a fresh database.
2. Click "Add product" → "Add manually", fill in concrete values, save — confirm it appears in the list immediately.
3. If a camera is available: click "Add product" → "Scan barcode", scan a real product — confirm the barcode pre-fills and the product saves. Describe what you tested if no camera was available: no camera was available in this environment; only the manual-entry and permission-denied paths were verified (see Design Decisions (a)).
4. Scan (or manually re-enter) the same barcode again — confirm you're routed to "this barcode is already X — edit it?" rather than a duplicate.
5. Open a product, change its stock quantity, save — confirm the list reflects it live.
6. Open a product, tap "Delete product", confirm via the dialog — confirm it disappears from the list.

## Known Debt

None beyond Phase 1/2's carried-forward Swahili-native-review item (this phase's `scanner`/`products`/`productForm` namespaces carry the same caveat — see Handoff Notes).

## Handoff Notes for Phase 4

- Final `Product`-facing signatures Phase 4 will use: `listProducts()`, `getProduct(id)`, `updateProduct(id, changes)` from `@/lib/db/products` — the sale flow's stock decrement should extend `updateProduct`-style patterns or add a dedicated `deductStock`/`recordCashSale` per its own phase file, not reinvent product lookups.
- `SyncQueue` entries are still not written anywhere (confirmed — see Design Decisions (c)). Phase 5 is retrofitting from a clean slate across Phases 1, 3, and 4's writes, not just this phase's.
- The `scanner`/`products`/`productForm` message namespaces are additions to the same running Swahili-review debt list from Phase 1/2 — Phase 9's review pass needs to cover all of them together.
- `AppLockGate`'s in-memory unlock state means **any E2E test for a Phase 4 screen must reach it via client-side navigation** (a `<Link>` click or `router.push`), never `page.goto()` after onboarding — a hard navigation remounts the gate and re-locks. See `e2e/product-management.spec.ts` for the working pattern.
- E2E tests now run against a production build (`npm run build && npm run start`), not `next dev` — factor the extra build time into any CI budget Phase 10 sets up, and don't reintroduce a `next dev`-backed `webServer` without re-verifying the Fast-Refresh-vs-navigation race from Deviation #3 doesn't resurface.
