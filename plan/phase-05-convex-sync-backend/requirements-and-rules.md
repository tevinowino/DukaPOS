# Phase 5 — Convex Sync Backend: schema, `/api/sync`, queue draining, background sync

> Audience: implementing AI agent. Read [`plan/global-rules.md`](../global-rules.md) and Phase 4's `overview.md` first. Follow the steps in order.
>
> **Research-verified facts (do not re-derive from training data — verify again against `https://docs.convex.dev` if anything here seems off, since Convex ships fast):**
> - Schema: `convex/schema.ts` exports a default `defineSchema({...})`; each table via `defineTable({...})` with field validators from `v` (`v.string()`, `v.number()`, `v.optional(...)`, etc.).
> - From Next.js Route Handlers / Server Actions: use `fetchQuery`, `fetchMutation`, `fetchAction` imported from `convex/nextjs`, passing the generated `api.*` reference and args. These require `NEXT_PUBLIC_CONVEX_URL` to be set (or an explicit `url` option as the 3rd argument).
> - **CSRF rule:** only Convex *queries* may be invoked from a GET route handler or Server Component (no side effects on GET). Mutations/actions are only called from POST/PUT route handlers or Server Actions.
> - `ConvexHttpClient` (from `convex/browser`) is the lower-level stateful HTTP client alternative; prefer `fetchQuery`/`fetchMutation`/`fetchAction` for simplicity unless a reason emerges to use it directly — if you do, do not share one instance across concurrent requests (it queues mutations statefully).
> - HTTP Actions (for the Paystack webhook, used starting Phase 8) are defined by exporting an `HttpRouter` from `convex/http.ts`, routed by path — but per ADR-3, this project keeps the webhook in the Next.js route (`/api/webhooks/paystack`), calling Convex via `fetchMutation`, **not** as a Convex HTTP Action. Do not build a `convex/http.ts` route for the webhook in this phase; that would contradict ADR-3.
> - Convex has no notion of your `shopId`-based tenancy built in — every table needs an explicit `shopId` field and every query/mutation takes it as an argument and indexes on it (`.index("by_shop", ["shopId"])`), per global-rules §5.1.

## 1. Objective

When this phase is done: a Convex deployment exists mirroring `Product` and `Transaction` shapes (scoped by `shopId`); local writes made while offline are queued in Dexie's `syncQueue` table and drained to Convex via `/api/sync` once connectivity returns (a reconnect listener is sufficient — true Background Sync API support is inconsistent across browsers, so don't block on it); and the queue-draining engine is generic enough that Phases 6 and 8 can enqueue their own offline-deferred actions (a photo waiting to be identified, a stock-parse request, later) into the same mechanism without inventing a second one.

## 2. Read First

- `ARCHITECTURE.md` §4.5 (data model), §5.4 (offline→online sync flow), §9 ADR-1 and ADR-3
- Phase 3 `overview.md` and Phase 4 `overview.md` — final `Product`/`Transaction` shapes, and whether either phase already writes `SyncQueue` entries (if so, this phase adapts to what exists rather than re-inventing it)

## 3. Deliverables

| Path | Purpose |
|---|---|
| `convex/schema.ts` | `products` and `transactions` tables mirroring the local Dexie shapes plus `shopId`, each indexed `by_shop` |
| `convex/products.ts` | `upsertProduct` mutation, `listByShop` query — both take `shopId` explicitly |
| `convex/transactions.ts` | `upsertTransaction` mutation (idempotent on a stable id, since retries must not duplicate), `listByShop` query, `getByReference` query (Phase 8 will use this for the M-Pesa status poll — build it now since the table exists here) |
| `src/lib/sync/queue.ts` | `enqueue(entry)`, `drainQueue()` — the generic engine other phases hook into |
| `src/app/api/sync/route.ts` | `POST` handler: reads pending `SyncQueue` entries the client sends (or reads Dexie directly if this runs client-triggered — see step 4), calls the matching Convex mutation per entry type, marks entries synced |
| `src/lib/sync/useOnlineSync.ts` (or similar hook) | Listens for the browser `online` event (and checks `navigator.onLine` on mount) and triggers `drainQueue()` |
| `.env.local.example` update | Adds `NEXT_PUBLIC_CONVEX_URL`, `CONVEX_DEPLOY_KEY` (names only) |

## 4. Implementation Steps (in order)

1. **Initialize Convex.** `npm install convex`, `npx convex dev` to scaffold `convex/` and get a dev deployment URL — set `NEXT_PUBLIC_CONVEX_URL` in `.env.local` (real value, gitignored) and add the name (no value) to `.env.local.example`.
2. **Write `convex/schema.ts`** mirroring Phase 3/4's final `Product`/`Transaction` shapes exactly (read their `overview.md`s for the verbatim types), adding `shopId: v.string()` to both tables and a `.index("by_shop", ["shopId"])` on each. For `transactions`, also index `by_shop_and_reference` if Phase 4 or this phase introduces a stable dedupe id (needed for idempotent upserts — see step 4).
3. **Write `convex/products.ts` and `convex/transactions.ts`.** Doc-comment each exported function's contract first. `upsertProduct(shopId, product)` and `upsertTransaction(shopId, transaction)` both key on the entity's own `id` (generated client-side, e.g. from Dexie's primary key) so re-sending the same entry twice (a retried sync) is a no-op the second time, not a duplicate row — use Convex's `.withIndex(...).unique()` pattern or a `patch`-if-exists/`insert`-if-not pattern.
4. **Design the queue-draining engine.** `enqueue(entry: {type: 'product' | 'transaction', payload, createdAt})` writes a row to Dexie's `syncQueue`. `drainQueue()` reads all unsynced entries, calls `POST /api/sync` with the batch, and on a success response marks each entry's `syncedAt`. The Next.js route itself is a thin translator: for each entry, call the matching `fetchMutation(api.products.upsertProduct, {...})` or `fetchMutation(api.transactions.upsertTransaction, {...})`, passing the shop's `shopId` (sent by the client in the request body — the client is the only place that knows its own `shopId`, since there's no server session per ADR-2).
5. **Wire the reconnect trigger.** On the `window online` event and on initial app mount if `navigator.onLine` is already true, call `drainQueue()`. Also expose a manual "sync now" affordance somewhere reachable (even a small icon in the shell) so a shopkeeper isn't stuck guessing whether sync happened — visible sync status (idle / syncing / last synced at HH:MM / failed) is part of this phase's UI, not a nice-to-have, since PRD §6 requires "graceful degradation" to be visible, not silent.
6. **Retrofit Phase 3/4 writes to call `enqueue`** if they don't already (per their `overview.md`s) — every `addProduct`/`updateProduct`/`recordCashSale` write should also enqueue a corresponding sync entry. Do this by adding the `enqueue` call at the single point each of those functions already writes to Dexie, not by scattering calls throughout the UI layer.
7. **Verify:** go offline (DevTools → Network → Offline), add a product and record a sale, confirm both appear in the `syncQueue` unsynced; go back online, confirm `drainQueue` fires and the Convex dashboard shows the synced rows.

## 5. Edge Cases & Required Handling

| Edge case | Required handling |
|---|---|
| `/api/sync` called with an entry whose `type` isn't recognized | The route skips it, logs a warning (not a crash), and does not mark it synced — leaves it for a human/future fix rather than silently dropping data. Test it. |
| Same `SyncQueue` entry sent twice (e.g. the client retried after a network blip mid-request, unaware the first attempt actually succeeded) | The Convex mutation's upsert-by-id behavior (step 3) makes this a no-op the second time — no duplicate `products`/`transactions` rows. Test it at the Convex-function level. |
| Draining a queue of 200+ entries (a shop that was offline all day) | Batch the `/api/sync` POST body rather than one HTTP request per entry — confirm a reasonable batch size (document what you chose and why) so a single request body doesn't become unreasonably large. Test with a batch of at least a few dozen synthetic entries. |
| `drainQueue()` called while a previous drain is still in flight (rapid online/offline flapping) | Guard against concurrent drains (an in-memory "currently syncing" flag) so two drains don't both try to send the same unsynced entries simultaneously. Test it. |
| Convex deployment unreachable (network up, but Convex itself errors or times out) | `/api/sync` returns a clear error status; `drainQueue()` leaves entries unsynced and the sync-status UI shows "failed, will retry" rather than silently marking things synced. Test it by mocking the Convex call to reject. |

## 6. Required Tests

- `convex/products.test.ts`, `convex/transactions.test.ts` (using `convex-test` or an equivalent local Convex test harness — pick one, document the choice in `overview.md`): `upsertProduct` called twice with the same product `id` and `shopId` results in exactly one row in `listByShop`, with the second call's field values winning (proves upsert, not duplicate-insert); `listByShop` scoped to `shopId: "shop-a"` never returns a product upserted under `shopId: "shop-b"`; `upsertTransaction` is similarly idempotent on its id; `getByReference` returns `null`/`undefined` for a reference that was never upserted.
- `src/lib/sync/queue.test.ts`: `enqueue` followed by `drainQueue` (with `fetch` mocked to a successful `/api/sync` response) marks the entry's `syncedAt` as set; a failed `/api/sync` response (mocked 500) leaves `syncedAt` unset; calling `drainQueue()` a second time while the first mocked call hasn't resolved yet does not send a second overlapping request (assert the mock `fetch` was called once, not twice, using a controllable/delayed mock).
- `src/app/api/sync/route.test.ts`: POSTing a batch with one `product` entry and one `transaction` entry results in both matching Convex mutations being called (mock `fetchMutation`) with the correct `shopId` and payload; POSTing an entry with an unrecognized `type` does not call any mutation and the response indicates that entry was skipped, not silently accepted.
- `e2e/offline-sync.spec.ts` (Playwright, using `context.setOffline(true)`/`(false)`): go offline, add a product, confirm the sync-status UI shows "not yet synced" (or equivalent); go back online, confirm the sync-status UI updates to reflect a successful sync within a reasonable wait.

## 7. Phase Rules

- No Convex client SDK (`useQuery`/`useMutation` React hooks, `ConvexProvider`) in any client component — per ADR-1/ADR-3, the browser never talks to Convex directly in this MVP. All Convex access is server-side, from Next.js route handlers.
- Do not build the Paystack webhook or `convex/http.ts` in this phase — that's explicitly Phase 8's, per the Research-verified facts block above.
- Do not implement true Service Worker Background Sync API registration unless it's trivial on top of what Serwist already set up in Phase 1 — the reconnect-listener approach is the required baseline; Background Sync is a nice-to-have you may add only if it doesn't cost meaningful time, and if you do, document it as a deviation/enhancement, not a silent scope change.
- Sync is one-directional in this MVP (device → Convex). Nothing pulls Convex data back down into Dexie in this phase — the only place that changes is Phase 8's ADR-3 poll route, which is scoped narrowly to one transaction's status, not a general downward sync. Do not build a general pull-sync mechanism; it's out of scope for the hackathon timeline.

## 8. Definition of Done

1. A human can: go offline, add a product and record a sale, see them queued/unsynced in the UI; go online, see the sync status update to reflect success; and independently confirm (via the Convex dashboard) the rows landed there scoped to the correct `shopId`.
2. All §6 tests green; `npm run lint` and `npm run build` clean; `NEXT_PUBLIC_CONVEX_URL` and `CONVEX_DEPLOY_KEY` added to `global-rules.md`'s env registry (already pre-listed there) and to `.env.local.example`.
3. `overview.md` completed, including: the exact `convex/schema.ts` table definitions pasted verbatim (Phase 8 extends `transactions` with pending/completed status handling and needs this exact shape); the batch size chosen for `/api/sync`; confirmation that `getByReference` exists and its exact query signature (Phase 8's `/api/checkout/status` route calls it directly).
