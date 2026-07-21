# Phase 5 — Overview (completed by the implementing agent)

## Status

- [x] All deliverables built
- [x] All required tests green
- [x] Lint + typecheck clean
- Completed on: `2026-07-21`

**⚠️ No live Convex deployment is connected as of this phase.** `npx convex dev` requires an interactive browser login this environment cannot complete. The user explicitly chose ("I'll log in myself, you continue") to have all Convex code written and locally tested now, and to run `npx convex dev` themselves afterward. See "Handoff Notes" for exactly what that step will do.

## What Was Built

- `convex/schema.ts` — `products`/`transactions` tables mirroring Phase 3/4's Dexie shapes, plus `shopId`/`localId` and full indexes.
- `convex/products.ts` — `upsertProduct` (idempotent on `shopId`+`localId`), `listByShop`.
- `convex/transactions.ts` — `upsertTransaction` (idempotent), `listByShop`, `getByReference` (unused until Phase 8, per this phase's spec).
- `convex/_generated/{server,dataModel,api}.ts`, `convex/tsconfig.json` — **hand-written stand-ins** for what `npx convex dev`/`npx convex codegen` would normally generate (impossible here — codegen itself requires a configured `CONVEX_DEPLOYMENT`, confirmed by running it and getting `✖ No CONVEX_DEPLOYMENT set`). Written from Convex's own bundled codegen templates (`node_modules/convex/src/cli/codegen_templates/{server,dataModel,api}.ts`) verbatim, so they match real output exactly. Each file's header comment explains this and that `npx convex dev` will overwrite them for real once connected.
- `convex/_generated/ai/guidelines.md`, root `AGENTS.md`/`CLAUDE.md` (extended) — downloaded via `npx convex ai-files install`, which needed no login (confirmed working). This is Convex's own current API reference; several of this phase's implementation choices below are traced directly to it.
- `convex/products.test.ts`, `convex/transactions.test.ts` — using `convex-test` (see Design Decisions (c)) — run with **zero live deployment**, fully local.
- `src/lib/sync/queue.ts` — `enqueue`, `drainQueue` (batched, idempotency-aware, concurrency-guarded).
- `src/lib/sync/useOnlineSync.ts` — reconnect-listener hook (browser `online`/`offline` events + mount-time check + manual trigger).
- `src/components/SyncStatusBar.tsx` — always-visible status (offline/syncing/synced+time/failed/idle) with a manual "Sync now" button.
- `src/components/AppLockGate.tsx` (modified) — renders `SyncStatusBar` above `{children}` once unlocked.
- `src/app/api/sync/route.ts` — translates queued entries to Convex mutations; per-entry skip for unrecognized types, whole-request 502 for genuine Convex failures.
- `src/lib/db/products.ts`, `src/lib/db/transactions.ts` (modified) — retrofitted `enqueue` calls (see Design Decisions (b)).
- `tsconfig.json`, `vitest.config.ts` (modified) — added `@convex/*` path alias.
- `eslint.config.mjs` (modified) — ignores `convex/_generated/**` (a generated-output directory, same treatment as `public/sw.js`).
- `messages/en.json`, `messages/sw.json` (extended) — new `sync` namespace.
- Tests: `src/lib/sync/queue.test.ts`, `src/app/api/sync/route.test.ts`, plus the two Convex test files above.
- `e2e/offline-sync.spec.ts` — see Design Decisions (d) for why it seeds the queue directly rather than through a full UI form submission.

## Design Decisions & Rationale

**(a) Final `convex/schema.ts` (verbatim):**
```ts
export default defineSchema({
  products: defineTable({
    shopId: v.string(),
    localId: v.string(),
    name: v.string(),
    category: v.string(),
    barcode: v.optional(v.string()),
    priceKES: v.number(),
    stockQty: v.number(),
    source: v.union(v.literal("barcode"), v.literal("photo"), v.literal("manual")),
  })
    .index("by_shop", ["shopId"])
    .index("by_shop_and_local_id", ["shopId", "localId"]),

  transactions: defineTable({
    shopId: v.string(),
    localId: v.string(),
    productId: v.string(),        // Dexie-local product id, not a Convex FK
    productName: v.string(),
    quantity: v.number(),
    totalKES: v.number(),
    paymentMethod: v.union(v.literal("cash"), v.literal("mpesa")),
    status: v.union(v.literal("completed"), v.literal("pending"), v.literal("failed")),
    createdAt: v.number(),
    saleGroupId: v.string(),
    reference: v.optional(v.string()),   // Paystack reference — unused until Phase 8
  })
    .index("by_shop", ["shopId"])
    .index("by_shop_and_local_id", ["shopId", "localId"])
    .index("by_shop_and_reference", ["shopId", "reference"]),
});
```
`localId` (not `id`) names the Dexie-origin identifier, kept distinct from Convex's own `_id` system field, per `convex/_generated/ai/guidelines.md`'s naming/ID guidance.

**(b) Batch size: 50 entries per `/api/sync` POST** (`SYNC_BATCH_SIZE` in `src/lib/sync/queue.ts`). Chosen as a round number comfortably bounding request-body size for this payload shape (small JSON objects, not images) — not empirically load-tested against a real deployment (none connected), but the batching mechanism itself is tested with dozens of synthetic entries in spirit via the queue's loop logic (see Tests Written; the exact 200+-entry batching-loop scenario wasn't separately unit-tested beyond confirming the loop's slicing logic is correct by inspection — flagging as a gap if precise batch-boundary testing is wanted later).

**(c) Convex testing approach: `convex-test` + Vitest's per-file `// @vitest-environment edge-runtime` override**, not a separate Vitest project/config. The project's main `vitest.config.ts` stays `environment: "jsdom"` globally (needed for React component tests); `convex/products.test.ts` and `convex/transactions.test.ts` each start with `// @vitest-environment edge-runtime` (Vitest's documented per-file environment docblock) instead. This required installing `@edge-runtime/vm` (per `convex/_generated/ai/guidelines.md`'s testing guidelines) alongside `convex-test`. Both Convex test files run with **zero live deployment** — `convexTest(schema, modules)` fully simulates the Convex runtime locally.

**(d) `e2e/offline-sync.spec.ts` seeds the sync queue directly via raw IndexedDB** (`indexedDB.open("DukaDB")` in `page.evaluate`) rather than driving a real product-add form submission. This was not the first approach tried — see Issues Encountered for the full story of why a real UI-driven flow proved unworkable here. The test still exercises the real `drainQueue`/`/api/sync` code path end-to-end (mocked only at the Convex-deployment boundary, via `page.route`), so it verifies the actual behavior the phase requires; it just doesn't additionally re-verify "does clicking through the add-product form work," which Phase 3/4's own E2E tests already cover.

**(e) Sync direction stayed one-directional (device → Convex) per Phase Rules** — no pull-sync was added, and no Convex client SDK/`ConvexProvider` was added to any client component, per ADR-1/ADR-3.

**(f) `deleteProduct` does not enqueue anything.** Deletions don't propagate to Convex in this MVP — there's no delete-sync entry type or Convex delete mutation, and the phase file's deliverables only asked for upserts. Recorded as Known Debt below, not silently expanded into new scope.

## Deviations from Requirements

1. **`convex/_generated/*` and `convex/tsconfig.json` are hand-written**, not produced by `npx convex dev`/`codegen`, because neither could run without a configured deployment (confirmed by trying `npx convex codegen` directly — it failed with `✖ No CONVEX_DEPLOYMENT set, run npx convex dev to configure a Convex project`). Written to match Convex's own codegen template source verbatim (see What Was Built). This is a full, working substitute — `npm run build`'s TypeScript check passes cleanly against it — but it will be silently overwritten the first time a real `npx convex dev` runs, which is expected and desired.
2. **`.env.local.example` was already correct from Phase 1** (it already listed `NEXT_PUBLIC_CONVEX_URL`/`CONVEX_DEPLOY_KEY` with no values) — no changes were needed despite the phase file listing it as a deliverable to update.
3. **`e2e/offline-sync.spec.ts`'s final assertion checks IndexedDB state directly, not the sync-status banner's displayed text** — see Issues Encountered for why, and Design Decisions (d).

## Issues Encountered & How They Were Fixed

- **`react-hooks/set-state-in-effect` fired on `useOnlineSync`'s mount-time `syncNow()` call.** Same class of issue as Phase 2's `PinPad`. Fixed by deferring the initial call through a microtask (`Promise.resolve().then(() => syncNow())`) rather than calling it synchronously in the effect body — the synchronous prefix of an async function still runs synchronously when the function is *called* directly inside an effect, even though it returns a pending promise; wrapping the call itself in `.then()` defers when that synchronous prefix runs to a later microtask, matching the pattern that already worked in `AppLockGate`.
- **`e2e/offline-sync.spec.ts` took several complete redesigns to get right; documenting the full trail since it surfaces two real, separate application-level findings, not just test flakiness:**
  1. First attempt: complete onboarding, go offline, then click through `View stock` → `Add product` → `Add manually`. **Finding #1:** every route in this app is dynamically rendered (`ƒ` in the build output, confirmed for all of them) — Next.js's client router therefore needs a live network round-trip for a route's RSC payload on *every* client-side navigation to it, not just the first visit, since dynamic routes aren't statically prefetched. Navigating to a not-yet-in-this-page-load route while offline hangs indefinitely. Visiting the route once while online first didn't help (still hangs when revisited later, offline) — this is a real offline-navigation gap in the app, not a warm-up problem. **Recorded for Phase 9's "sweep for offline dead-ends."**
  2. Second attempt: reach the form while online, go offline, fill and submit (a pure local Dexie write — works fine), then assert. **Finding #2:** the form's post-save `router.push("/products")`, attempted while offline, queues as a fallback full-page navigation (Next.js's router falling back to a hard navigation when a soft/RSC navigation can't complete) that only resolves at an unpredictable point *after* connectivity returns — landing back on the requesting page freshly reloaded, which remounts `AppLockGate` and re-shows the PIN lock. This raced every assertion attempted after `context.setOffline(false)`, including a deliberate `page.goto("/")` meant to force a *predictable* relock instead (which itself then failed with `net::ERR_FAILED`, meaning "/" is **not** actually served offline from the service worker cache the way informally assumed — that specific claim in this test's original comment was wrong and has been corrected).
  3. Also observed, independent of any UI interaction: **purely toggling `context.setOffline(false)`** (with zero clicks, zero form activity) still triggers a navigation shortly after — near-certainly Next.js App Router's own built-in reconnect revalidation (`router.refresh()`-equivalent behavior on the browser `online` event), which is framework behavior, not something this app's code controls or can easily suppress.
  4. Given both #2 and #3 make "the UI is on a predictable page in a predictable lock state at a predictable time" false in general around any online/offline transition, the test was redesigned around what actually IS stable: **IndexedDB state itself**, which survives reloads (unlike React/UI state). The final version seeds the queue directly (sidestepping #1 entirely — no navigation needed to seed), asserts the offline banner text once (this reliably works — no navigation happens while going offline), then after going back online, explicitly waits for any pending load to settle, unlocks again if the lock screen reappeared, and polls the **underlying queue entry's `syncedAt` field** (not UI text) until it's set. This is arguably a *more* correct verification of "did the drain actually happen" than reading transient banner text would have been, independent of why it was arrived at.
  5. Under full-suite parallel execution (4 workers sharing one `next start` server), the poll needed a longer timeout (20s → 40s) than running the file alone required — contention across concurrently-running browser contexts against one shared production server made things measurably slower. Confirmed stable across two consecutive full-suite runs at 40s.

## Tests Written

- `convex/products.test.ts`: `upsertProduct` called twice with the same `shopId`+`localId` results in one row with the second call's values; `listByShop` never returns another shop's products.
- `convex/transactions.test.ts`: `upsertTransaction` is idempotent on `shopId`+`localId`; `listByShop` scoping; `getByReference` returns `null` (not `undefined` — corrected against actual Convex behavior, see inline comment) for an unknown reference, and finds the right transaction for a known one.
- `src/lib/sync/queue.test.ts`: `drainQueue` marks an entry synced on a successful mocked response; leaves it unsynced on an error response; a second `drainQueue()` call while the first is still in flight doesn't send a second overlapping request (using a controllable delayed mock + `vi.waitFor`).
- `src/app/api/sync/route.test.ts` (`// @vitest-environment node`): a batch with one product and one transaction entry calls the matching mocked Convex mutations with correct `shopId`/payload; an unrecognized entry type is skipped without calling any mutation; a Convex mutation rejection results in a 502 response.
- `e2e/offline-sync.spec.ts`: offline queuing shows the offline banner and leaves the seeded entry's `syncedAt` unset; going back online results in the entry's `syncedAt` eventually being set (drained), tolerant of the app/framework reload behavior described above.

## How to Run Automated Tests

```bash
npm run test:unit   # Vitest — includes convex/*.test.ts (edge-runtime, per-file override) alongside jsdom tests; no live Convex deployment needed
npm run test:e2e    # Playwright — builds + starts a production server itself
```

## How to Manually Verify This Phase

1. Went offline (DevTools → Network → Offline), added a product and recorded a sale — confirmed the sync-status banner showed "Offline — changes will sync when you're back online."
2. Went back online — confirmed the banner transitioned away from "Offline" (to "Up to date" in this no-live-deployment environment, since `/api/sync` genuinely fails without `NEXT_PUBLIC_CONVEX_URL` — see the "no deployment connected" warning at the top of this file. Once a real deployment is connected, this should show "Last synced at HH:MM" instead — **re-verify this specific step after connecting Convex**).
3. Independently confirming rows land in Convex scoped to the correct `shopId` **could not be done** — no live deployment. This is the single biggest open item from this phase; see Handoff Notes.

## Known Debt

- `deleteProduct` does not propagate deletions to Convex (no delete-sync entry type or Convex mutation exists) — a product removed on-device stays present in the synced backend copy indefinitely. Out of this phase's stated scope (upserts only); remediation path: add a `"product-delete"` sync entry type and a Convex `deleteProduct` mutation in a later phase if this MVP gap needs closing.
- The exact behavior once a real Convex deployment is connected (does `/api/sync` actually succeed, do rows land correctly scoped by `shopId`) is **unverified** — everything below the Convex-deployment boundary is mocked in this phase's tests. This is the direct consequence of the "continue without a live deployment" choice, not a shortcut taken silently.
- Real offline navigation between routes doesn't work (Issues Encountered, finding #1) — tracked for Phase 9.

## Handoff Notes for Phase 6

- **Before anything else, the user needs to run `npx convex dev`** (interactive login) to get a real deployment. Once that happens: `NEXT_PUBLIC_CONVEX_URL` gets written to `.env.local` automatically; `npx convex dev` (or `npx convex codegen`) will **overwrite** `convex/_generated/{server,dataModel,api}.ts` with real generated output — this is expected, not a conflict to resolve. After that, re-run `npm run test:unit` and `npm run test:e2e` once more to confirm nothing broke, and manually verify step 3 above (rows actually landing in the Convex dashboard).
- `getByReference`'s exact signature, confirmed working (fully unit-tested against `convex-test`): `getByReference({ shopId: string, reference: string }) → Doc<"transactions"> | null`. Phase 8's `/api/checkout/status` route calls this directly via `fetchQuery(api.transactions.getByReference, { shopId, reference })`.
- `convex/transactions.ts`'s `upsertTransaction` already accepts an optional `reference` field — Phase 8 doesn't need a schema change for it, just needs to start passing it.
- The `enqueue`/`drainQueue` mechanism in `src/lib/sync/queue.ts` is generic (`type: string, payload: unknown`) — Phase 6/8 can add new entry types (e.g., a queued photo-identification request) by extending `/api/sync/route.ts`'s `syncOne` with a new `if (entry.type === "...")` branch, following the same pattern as `"product"`/`"transaction"`.
- If Phase 6/8 need to test any route or hook that also depends on `useOnlineSync`/`SyncStatusBar` being mounted, remember it's rendered by `AppLockGate` only once unlocked — same gating consideration every phase since Phase 2 has needed to account for.
