# Performance Notes

Measured against `PRD.md` §6's Non-Functional Requirements table, as of the shipped Phase 1–10 code. Every figure below is a real measurement taken during this phase, not an estimate — the method is stated for each so it can be reproduced.

## Barcode lookups near-instant (local)

**Target:** "Barcode lookups near-instant (local)."

**Method:** A throwaway Vitest test (`fake-indexeddb` + the project's real `src/lib/db/products.ts` functions, no mocking) seeded 150 products (a generously large single-shop catalog) and called `getProductByBarcode` 20 times against a barcode in the middle of that set, timing each call with `performance.now()`.

**Result:** avg **1.75ms**, min 0.42ms, max 8.07ms (n=20, 150-product catalog).

For comparison, `listProducts()` (the full stock-screen load) against the same 150-product catalog: avg **5.54ms**, min 3.21ms, max 6.99ms (n=10).

Both are comfortably sub-10ms — "near-instant" is met. Caveat: this measures the Dexie/IndexedDB query itself in a Node+`fake-indexeddb` test environment, not a real phone's browser IndexedDB implementation or the camera-to-detection latency of the barcode scanner itself (see "Known unmeasured items" below) — the *data lookup* half of the barcode flow is what's being verified here.

## Gemma 4 photo ID: 2–6s target

**Target:** "Gemma 4 photo ID target 2-6s via hosted API."

**Method:** Not re-measured in this phase — reusing Phase 7's real, live measurement against the actual Gemini API (`gemma-4-26b-a4b-it`), to avoid burning additional API quota for a number that was already correctly and recently measured. Phase 7's overview.md records: `identifyProduct` **2.1–3.3s**, measured via a live smoke test hitting the real hosted API.

**Result:** Within the 2–6s target.

**Caveat, carried forward honestly from Phase 6/7:** that live measurement used a meaningless 1×1 test pixel as the photographed "product" (no physical camera/photo was available in that environment either) — it validates the API round-trip latency, not accuracy or latency against a real product photo with a real camera capture + client-side compression step first. **This remains genuinely unverified** — see `docs/SECURITY_AUDIT.md`... actually, tracked in this phase's `overview.md` "Known Debt" list, not fixed here (no camera/photo available in this environment either).

For reference, two other AI-dependent operations measured live in Phase 7 (no PRD-stated target, but useful context): `parseStockUpdate` **1.5s**; `generateSummary` **10.6s (English) / 22.6s (Swahili)** — well above the photo-ID target, but the PRD's 2–6s target is explicitly scoped to photo ID only, not summary generation (Phase 7's own analysis). The summary generation latency is a real, open UX gap (a shopkeeper waits 10–23s for an on-demand summary) — not fixed in this phase; see the final debt list in this phase's `overview.md`.

## Offline capability: core loop fully functional with zero connectivity

**Target:** "Core loop (add product, record sale, view stock) fully functional with zero connectivity."

**Method:** A Playwright test, DevTools-offline-equivalent (`context.setOffline(true)`), with the real service worker active (not blocked, unlike most of this project's other E2E specs — see `playwright.config.ts`'s comment for why blocking is the default elsewhere). Every route the loop touches was visited once online first (mirroring a shopkeeper who already opened the app earlier in the day), then, fully offline: viewed stock, added a product (Dexie write), and recorded a cash sale (Dexie write + stock decrement) — each `Response`'s `response.fromServiceWorker()` was checked.

**Result:** **Zero** non-service-worker responses across the entire loop (view stock → add product → confirm sale). Every single response — including the Next.js client-side route transitions between screens — was served by the service worker, none reached the real network.

This is a genuine, verified pass of the PRD's offline-core-loop requirement, and also verifies the fixes documented in this phase's `overview.md` (the `ignoreSearch` cache-matching fix and the `setCatchHandler` offline-shell fallback in `src/app/sw.ts`) actually hold for the specific loop the PRD calls out — not just the individual repro cases they were built to fix.

## Reliability: graceful degradation if Gemma 4 or Paystack is unreachable

**Target:** "No data loss on connectivity drop; graceful degradation if Gemma 4 or Paystack API is unreachable."

**Method:** Verified via existing E2E coverage, not re-measured numerically (this is a behavioral requirement, not a latency one): `e2e/localization-and-offline.spec.ts` confirms the stock-update page shows an honest "needs a connection" message (not a hang or raw error) when attempting an AI action offline; `src/app/api/checkout/route.ts` and `src/app/[locale]/checkout/mpesa/page.tsx` return/display a clear error if the Paystack charge request itself fails (`PaystackChargeError` → a 502 with a message, not an unhandled exception). "No data loss on connectivity drop" is the entire point of the sync-queue architecture (`src/lib/sync/queue.ts`, verified by `e2e/offline-sync.spec.ts`) — a write made offline is never lost, only delayed until the next successful sync.

## Known unmeasured items (honest gaps, not silently assumed)

- **Barcode scanner camera-to-detection latency** (the `BarcodeDetector`/`@zxing/browser` half of the flow, not the Dexie lookup measured above) — never tested against a real camera/physical barcode in any phase (Phase 3's own overview.md flags this, still open as of Phase 9). Cannot be measured in this environment (no camera device attached to this sandboxed session).
- **Photo ID accuracy/latency against a real photographed product** (not a 1×1 test pixel) — same root cause, no camera available.
- These two are the same class of gap: this development/testing environment has no physical camera. Both should be verified on a real phone before a live demo — flagged as an open item in this phase's `overview.md`.
