# Phase 10 — Overview (completed by the implementing agent)

## Status

- [x] All deliverables built
- [x] All required tests green
- [x] Lint + typecheck clean
- Completed on: `2026-07-22`

## What Was Built

- `e2e/full-shopkeeper-journey.spec.ts` — one continuous journey (via `test.step()`) covering every PRD §4 MVP capability at least once: onboarding, all three product-add methods (manual, barcode-entry-point-with-manual-fallback, photo), a cash sale, an M-Pesa sale, an NL stock update, the daily summary, then an offline/online cycle. Surfaced a real bug during authoring (see Issues Encountered).
- `docs/SECURITY_AUDIT.md` — full audit: Convex `shopId` scoping (all 6 functions, confirmed correct), no client-side Convex imports, secrets confined server-side with no `NEXT_PUBLIC_*` leakage, webhook raw-body signature verification re-confirmed, `totalKES` server-computed re-confirmed, PIN hashing **verified live against real IndexedDB** (not just the unit test — see the audit's finding #7 for the exact captured record), plus one low-severity local-file hygiene note.
- `docs/PERFORMANCE_NOTES.md` — real measurements: barcode lookup (avg 1.75ms, 150-product catalog, via a throwaway Vitest+fake-indexeddb test), the full offline core loop (view stock → add product → cash sale) proven to make **zero** non-service-worker network responses via a live Playwright check of `response.fromServiceWorker()`, plus honestly-carried-forward Phase 7 figures for AI latency and honestly-flagged unmeasurable items (camera-dependent tests, no camera in this environment).
- `docs/DEPLOYMENT.md` — cold-start Vercel + Convex + Paystack webhook runbook with a concrete post-deploy smoke test.
- `PROVIDER_SWITCHING.md` — the one-env-var AI provider switch, explicit that `selfhosted.ts` is still a stub.
- `src/app/sw.ts` — a real bug fix: `serwist.setCatchHandler(...)` now falls back to a static, precached `public/offline.html` shell when a navigation's `NetworkFirst` strategy exhausts both network and cache (the "never-visited-this-session route, offline" case Phase 5 first found and Phase 9's `ignoreSearch` fix didn't cover — see Issues Encountered).
- `public/offline.html` — the static fallback page the catch handler serves; bilingual (EN/SW), precached automatically the same way the existing app icons already are (confirmed via a live Cache Storage dump, not assumed).
- `src/components/AppLockGate.tsx`, `src/components/OfflineIndicator.tsx`, `src/components/SyncStatusBar.tsx` — a real bug fix: `useOnlineSync()` is now called exactly once in `AppLockGate` and passed down as props, instead of `OfflineIndicator` and `SyncStatusBar` each calling it independently. See Issues Encountered for the exact race this caused and how it was found.
- `src/components/SyncStatusBar.test.tsx` (new) — this component had no test at all before this phase (a real gap, closed here per this phase's own mandate to add tests for gaps hardening turns up).
- `src/components/OfflineIndicator.test.tsx` (updated) — simplified: no longer needs to mock the `useOnlineSync` module, since the component now takes `status` as a plain prop.
- `e2e/localization-and-offline.spec.ts` (extended) — one new regression test for the `sw.ts` catch-handler fix: a route never visited this session falls back to the offline shell instead of hanging.
- `ARCHITECTURE.md` — final reconciliation pass: fixed a real inaccuracy in ADR-3 (it claimed a poll-timeout is "reconciled on the next `/api/sync` pass" — untrue, `/api/sync` is push-only and no such reconciliation exists, per Phase 8's own overview.md), fixed a `GEMMA_API_KEY`→`GEMINI_API_KEY` typo in §7, updated §5.3 to reflect M-Pesa's single-item scope, and added **ADR-7** formalizing the `AppLockGate` remount-on-reconnect/locale-switch pattern (see Design Decisions (c)).

## Design Decisions & Rationale

**(a) Full consolidated debt list** — see "Known Debt" below; this is the canonical, final version, superseding any individual phase's own list.

**(b) Full "human should review before demo" list** — see "Handoff Notes" below, ranked by priority.

**(c) Two bugs found and fixed during hardening, previously undetected (not mislabeled debt — genuinely new findings from this phase's own testing work, not a reclassification of something earlier phases had already flagged):**

1. **Offline navigation to a route never visited this session hung indefinitely**, distinct from (and not fixed by) Phase 9's `ignoreSearch` cache-matching fix, which only helps routes visited at least once online. Root cause: every route is server-rendered with no static precache entry, so there's genuinely nothing cached to fall back to for an unvisited route — Serwist's `NetworkFirst` correctly throws once both network and cache are exhausted, and nothing was catching that throw. Verified live via a targeted repro (visit `/`, go offline, click a link to a never-opened route) both before the fix (hung past a 20s wait) and after (`setCatchHandler` serves `offline.html` within ~1s). Fixed in `src/app/sw.ts`; the earlier "was this actually fixed by Phase 9?" open question from the consolidated debt research (see Handoff Notes) is now resolved: **no, it needed this separate fix, which is now in place.**
2. **`SyncStatusBar` could get permanently stuck showing "Syncing…"** after a reconnect that also triggered `AppLockGate` to remount (ADR-7's pattern). Root cause: `OfflineIndicator` and `SyncStatusBar` each called `useOnlineSync()` independently; `drainQueue`'s module-level `currentlySyncing` lock prevents a duplicate *network* call but not duplicate *local* state — when both components' mount-effects fired `syncNow()` near-simultaneously after a remount, the loser of the lock got `"already-in-progress"`, and `syncNow`'s handling of that outcome ("leave status alone") left that component's own `status` state stuck at `"syncing"` forever, since nothing ever re-triggered it. Found live while writing `full-shopkeeper-journey.spec.ts` (a test asserting on `SyncStatusBar`'s recovered text hung on this exact bug) — not something any earlier phase's test caught, since `offline-sync.spec.ts` (Phase 5) only ever asserted on the underlying IndexedDB `syncedAt` field, never on this specific UI text, which sidestepped the bug without noticing it. Fixed by lifting the one `useOnlineSync()` call to `AppLockGate` and passing it down as props — verified via a new `SyncStatusBar.test.tsx` (this component had no test at all before this phase) and the now-reliably-passing journey spec (2/2 repeat runs).

**(d) Full-journey spec deliberately does not use the real service worker.** Every other network-mocked step in the journey (`identify-product`, `checkout`, `checkout/status`, `parse-stock`, `summary`, `sync`) relies on `page.route()` intercepting `fetch()` calls — an active service worker can claim a matching request (any `GET /api/*`, per `defaultCache`) before Playwright's mock ever sees it, exactly the bug Phase 7 already found and fixed by blocking the SW by default. The offline step is written to not need the SW either: it drops into offline state on a page that's *already fully loaded*, so nothing needs to be freshly fetched — the "existing data stays usable offline" claim doesn't require proving fresh SW-backed navigation reliability, which `e2e/localization-and-offline.spec.ts` already covers as a dedicated concern.

**(e) `/api/sync` is mocked from the very start of the journey test, not just in the final "back online" step.** This app's background sync fires on every `useOnlineSync()` mount while online, not only right after a deliberate offline/online cycle — a long journey with many product-add/sale steps triggers many of these in the background. Mocking late left early ones hitting the real (Convex-less) endpoint, which raced with the later mocked ones via `drainQueue`'s in-flight guard and produced confusing, hard-to-diagnose failures before the real root cause (Design Decision (c).2) was found.

## Deviations from Requirements

None from the phase file's literal deliverable list. The two bug fixes in (c) go beyond "audit and report" into "audit, find, and fix" — explicitly within this phase's own mandate ("this phase has full authority and obligation to patch such findings, not just report them").

## Issues Encountered & How They Were Fixed

See Design Decisions (c), (d), (e) above for the three substantial ones. Additionally:

- **`isVisible()` vs `waitFor()` race, twice.** Both the offline-navigation regression test and the journey spec's "back online" step initially used `.isVisible().catch(() => false)` to check for an optional PIN relock — an instantaneous, non-polling check that can run before the relock UI has actually rendered, causing a false negative (treating a genuine relock as "didn't happen" and then hanging on a subsequent assertion). Fixed both by switching to a bounded `.waitFor({ state: "visible", timeout })`, which actually polls. This is the same class of fix already applied once in Phase 9's `localization-and-offline.spec.ts` — worth remembering as a standing pattern for any future "optionally-present element" check in this codebase's E2E suite.
- **The journey spec's "back online: sync recovers" step initially asserted the wrong final state** (`"Last synced at ..."`), assuming there would always be something pending to sync at that exact moment. Once `/api/sync` was mocked from the start (Design Decision (e)), everything had usually already synced earlier in the journey by the time the offline/online cycle ran, so `"Up to date"` (Convex's `"nothing-to-sync"` outcome) was the more common, equally-correct real result. Fixed by accepting either settled state and asserting neither the offline nor the stuck-syncing text remained.

## Tests Written

- `e2e/full-shopkeeper-journey.spec.ts`: one comprehensive test, `test.step()`-segmented — see "What Was Built" for the capabilities it touches. Passed reliably across 2 repeated runs (`--repeat-each=2`), per this phase's Definition of Done.
- `e2e/localization-and-offline.spec.ts` (new test added): a route never visited this session, while offline, falls back to the static offline shell instead of hanging — the regression test for the `sw.ts` catch-handler fix.
- `src/components/SyncStatusBar.test.tsx` (new): renders the correct message for each of the five `SyncStatus` values (`offline`, `syncing`, `failed`, `synced` with a timestamp, `idle`); clicking "Sync now" calls the `syncNow` prop. Closes a real pre-existing test gap (this component had zero coverage before this phase).
- `src/components/OfflineIndicator.test.tsx` (updated, not newly added): same three cases as before (Phase 9), simplified to pass `status` as a prop instead of mocking a hook module — no coverage was lost, the test just got simpler because the component did.

## How to Run Automated Tests

```bash
npm run lint         # 0 errors, 0 warnings
npx tsc --noEmit      # clean
npm run build         # production build, clean
npm run test:unit     # 108/108 passing across 31 files
rm -f public/sw.js && npm run test:e2e   # 12/12 specs passing (stale SW build artifact removed first — established project pattern; kill any stray process on :3000 first if a run hangs, see app-shell.spec.ts's comment for why)
```

## How to Manually Verify This Phase

1. Ran the full automated suite end to end per the commands above — all green, not just this phase's own additions (108 unit tests across 31 files, 12 E2E specs).
2. `docs/DEPLOYMENT.md` was written against the actual shipped `package.json` scripts and env var registry, but **not walked through on a genuinely fresh Vercel/Convex project in this session** — no real Vercel/Convex account access exists in this sandboxed environment. This is stated explicitly rather than silently assumed: a human should do a real first deploy following that runbook before trusting it completely, and fix the doc if any step turns out wrong.
3. `docs/SECURITY_AUDIT.md`'s findings are all either confirmed-correct-as-is or have an explicit accepted-risk note (ADR-2's `shopId` debt, and the low-severity local `.env.local` hygiene note) — no unresolved fixable finding remains.
4. `PROVIDER_SWITCHING.md`'s switch was confirmed correct by reading `gemmaClient.ts`'s actual `activeProvider()` implementation and `selfhosted.ts`'s actual stub behavior (every method throws a clear, specific "not implemented yet" error rather than crashing unhelpfully or silently pretending to work) — not re-run live, since doing so would require actually setting `AI_PROVIDER=selfhosted` in this environment's `.env.local` and re-testing every AI-dependent screen, which wasn't judged proportionate given the stub's behavior is already fully covered by reading its source directly.

## Known Debt

**Full consolidated list, superseding every individual phase's own list. Grouped by whether this phase changed its status.**

### Resolved this phase (previously open)
- Offline navigation to a never-visited-this-session route hanging indefinitely (Phase 5's original finding — Phase 9 partially addressed a related-but-distinct cache-key issue, this phase closes the remaining gap). **Fixed** — `src/app/sw.ts`'s `setCatchHandler`.
- `SyncStatusBar` could get permanently stuck on "Syncing…" after certain remounts (newly found this phase, not previously tracked anywhere). **Fixed** — shared `useOnlineSync()` instance in `AppLockGate`.
- `ARCHITECTURE.md` ADR-3 inaccurately claimed pending M-Pesa transactions get reconciled via `/api/sync` after a poll timeout. **Fixed (doc correction)** — no code changed, but the doc now matches the real (still-open, see below) behavior.
- `GEMMA_API_KEY` typo in `ARCHITECTURE.md` §7. **Fixed (doc correction).**

### Still open — accepted, bounded (`DEBT(prudent-deliberate)`)
- **`shopId` as the sole tenant-scoping credential, not an authenticated session** (ADR-2). Accepted for a single-device hackathon MVP; remediation path (server-verified phone+PIN sessions) explicitly named for any future multi-device/multi-tenant exposure.
- **M-Pesa poll-timeout-then-late-webhook gap** (ADR-3's amendment, Phase 8): if the 90s poll window elapses before the webhook fires, Convex updates correctly but the local Dexie copy never learns about it — no pull-sync direction exists (Phase 5 scoped sync as push-only). Local transaction stays `pending`, local stock stays un-decremented, with no further automatic reconciliation. This ADR now states the real behavior accurately (it previously claimed a reconciliation mechanism that doesn't exist — see "Resolved this phase").
- **`AppLockGate`'s in-memory unlock state doesn't survive a root-layout remount** (now formalized as ADR-7): triggered by the browser's `online` event (Phase 5) and by switching locale then navigating (Phase 9) — two independent triggers of the same underlying cause. Never a dead end (the PIN screen always works), just an unexpected re-prompt. A `sessionStorage`-backed unlock flag is the likely real fix if this proves annoying in practice; not built here, per Phase 9's own scope reasoning.
- **`deleteProduct` never propagates to Convex** (Phase 5) — upserts-only sync scope; a product deleted locally still exists in the Convex backend indefinitely.
- **`parseStockUpdate` silently drops later items in a compound multi-product message** (Phase 7, e.g. `"nimeongeza sugar 5 bags, sold 2 bread"` only returns the sugar line). Re-triaged this phase per the instruction to check whether earlier debt is actually a bug: the confirm-before-apply UI (every parsed line is shown for explicit review before `stock-update/page.tsx` applies anything) is confirmed to be the safety net that makes this an acceptable accuracy gap rather than a silent-data-loss bug — a shopkeeper reviewing the parsed lines would notice a missing item themselves, since only what's shown gets applied. Not further fixed (prompt-engineering iteration is unbounded effort for uncertain payoff); confirmed the safety net holds.
- **Summary generation latency (10.6s English / 22.6s Swahili)**, well above the photo-ID 2–6s target (which was never scoped to summary generation — not a violated requirement, but a real UX rough edge). Flagged in Phase 7, not addressed in Phase 9, not addressed here either — no code change proposed, since the underlying cause (a longer, harder generation task) isn't a quick fix.
- **Low severity:** a commented-out `sk_live_...` Paystack key sits in the local, gitignored, never-committed `.env.local` (found during this phase's security audit). No actual exposure occurred; recommend the user delete that line or revoke the key if it was ever real.

### Still open — genuinely unverified (not a design tradeoff, just untested)
- **Barcode scanner (`BarcodeDetector`/`@zxing/browser`) never tested against a real camera or physical barcode** (Phase 3) — only the manual-entry and permission-denied paths have been exercised, in this camera-less environment.
- **Photo product identification never tested against a real photographed product** (Phase 6/7) — only a meaningless 1×1 test pixel has been sent to the live Gemini API; the 2.1–3.3s latency measurement is real, but accuracy against an actual product photo is not verified.
- **The entire Swahili message catalog has never been reviewed by a native speaker** (Phase 1 through 9, every phase added its own strings to this same standing gap). See Handoff Notes for the priority list.

### Addendum (2026-07-23): live Convex deployment connected

The single most-recurring open item across this whole project (raised in Phases 5, 7, 8, 9, and again above) is now resolved. The user provided real deployment credentials (`tevin-owino/dukapos`, deployment `standing-retriever-94`); `NEXT_PUBLIC_CONVEX_URL` and `NEXT_PUBLIC_CONVEX_SITE_URL` are now set in `.env.local`, and `npx convex dev --once` pushed the schema and both function files for real, regenerating `convex/_generated/**` from the hand-written stand-ins that existed throughout Phases 5–10 (the regenerated files type-check cleanly against all existing code with zero changes needed — the stand-ins matched Convex's real templates exactly, as intended).

**Verified live, not just via the app's own UI:** completed onboarding, added a product, and recorded a cash sale through the real running app (no mocks), then independently confirmed both rows exist in the live database via `npx convex data products` / `npx convex data transactions` directly — the first genuine, non-mocked end-to-end proof that browser → `/api/sync` → Convex works, across all 10 phases.

This closes out `docs/DEPLOYMENT.md` §2's Convex setup steps as proven-correct-as-written (they were followed almost exactly to get this connected), not just as an untested runbook.

## Handoff Notes

Priority-ordered — a human picking this project up next (before or instead of a live demo) should look at these in this order:

1. ~~Connect a real Convex deployment~~ — **done, see the 2026-07-23 addendum above.** A production deployment (`npx convex deploy`, separate from the `dev` one now connected) is still worth doing before a real public launch, per `docs/DEPLOYMENT.md` §2.
2. **Get a native Swahili speaker to review the message catalog**, prioritizing the specific strings each phase flagged as least-scrutinized (Phase 9's overview.md has the most recent, most specific list; every earlier phase's own catalog additions have equally never been reviewed).
3. **Test on a real phone with a real camera**: barcode scanning (a real EAN/UPC label) and photo product identification (a real product photo) — both are currently only verified via fallback/stub paths in this camera-less environment.
4. Everything in "Known Debt → Still open — accepted, bounded" above is a deliberate, reasoned tradeoff, not an oversight — worth a skim before a demo so nothing there surprises anyone live, but none of it blocks shipping.
