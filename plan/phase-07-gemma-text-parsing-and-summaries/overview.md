# Phase 7 — Overview (completed by the implementing agent)

## Status

- [x] All deliverables built
- [x] All required tests green
- [x] Lint + typecheck clean
- Completed on: `2026-07-22`

**A real `GEMINI_API_KEY` became available partway through this phase** (added to `.env.local` between Phase 6 and Phase 7 — Phase 6's overview.md correctly flagged that it hadn't been). This let this phase do something Phase 6 couldn't: run real smoke tests against the live API. That surfaced genuine, load-bearing findings — including that Phase 6's chosen model id doesn't actually exist for this account — documented below and fixed in both phases' code as appropriate.

## What Was Built

- `src/lib/ai/types.ts` (extended) — `StockUpdate`, `DaySummaryInput`, `DaySummary`, `AiTextError`; `AiProvider` interface extended with `parseStockUpdate`/`generateSummary`.
- `src/lib/ai/providers/hosted.ts` (extended) — implements both new methods; also fixes Phase 6's model id (see Design Decisions (a)) and adds defensive markdown-fence stripping (see (b)) — both discovered via this phase's live smoke testing, applicable to Phase 6's `identifyProduct` too.
- `src/lib/ai/providers/selfhosted.ts`, `gemmaClient.ts` (extended) — stub/routing for the two new methods, same posture as Phase 6.
- `src/lib/db/products.ts` (extended) — new `applyStockDelta(productId, delta)`, the single place stock-quantity clamp-math happens now (see Design Decisions (c) — a small refactor of Phase 4's `deductStock` to eliminate a second parallel implementation of the same clamp logic).
- `src/app/api/parse-stock/route.ts`, `src/app/api/summary/route.ts` — thin routes; client sends its own product/transaction data (no server-side Dexie access, same reasoning as `/api/sync`).
- `src/app/[locale]/stock-update/page.tsx` — parse → per-line editable confirm (unmatched-product and missing-quantity lines block individually, not the whole batch) → apply.
- `src/app/[locale]/summary/page.tsx` — on-demand generate/regenerate.
- `src/components/ShellHome.tsx` (modified) — added "Update stock (text)" and "Today's summary" links.
- `messages/en.json`, `messages/sw.json` (extended) — `stockUpdate`, `summary` namespaces, plus two new `shell` keys.
- Tests: extended `src/lib/ai/providers/hosted.test.ts` (7 new cases), `src/app/api/parse-stock/route.test.ts`, `src/app/api/summary/route.test.ts`, `src/app/[locale]/stock-update/page.test.tsx`.
- `e2e/stock-update-and-summary.spec.ts` — full mocked journey.
- **E2E infrastructure fixes** (not scoped to this phase's feature, but found and fixed while verifying it — see Issues Encountered): `playwright.config.ts` now blocks service workers by default (`app-shell.spec.ts` opts back in), corrected the `timeout`/`workers` reasoning left inaccurate from Phase 5, and `e2e/app-shell.spec.ts` documents a stale-server-process gotcha for future debugging.

## Design Decisions & Rationale

**(a) Model id corrected: `gemma-4-4b-it` → `gemma-4-26b-a4b-it`.** Phase 6 chose `gemma-4-4b-it` based on the plan's research-verified facts, but had no live key to confirm it actually worked. This phase's live smoke test hit it and got a real `404 NOT_FOUND: models/gemma-4-4b-it is not found for API version v1beta`. Queried `GET https://generativelanguage.googleapis.com/v1beta/models` directly with the real key: **only `gemma-4-26b-a4b-it` and `gemma-4-31b-it` are actually available** for `generateContent` on this account/API version — `gemma-4-4b-it` and `gemma-4-12b-it` don't exist for it. Switched to `gemma-4-26b-a4b-it` (the smaller of the two real options) in `hosted.ts`'s single `MODEL_ID` constant, which both Phase 6's `identifyProduct` and this phase's two new methods share — one fix corrects all three.

**(b) Defensive markdown-fence stripping added (`stripJsonFence` in `hosted.ts`).** Also discovered via live testing: despite `responseMimeType: "application/json"` and a `responseSchema`, the model was observed wrapping its JSON output in a ` ```json ... ``` ` fence on some calls (inconsistently — not every call). `JSON.parse` fails on a fenced string (trailing content after the closing fence isn't valid JSON to `JSON.parse`), so this would have caused real, avoidable "couldn't identify/parse" failures. Fixed by stripping a leading/trailing fence (if present — a fence-free response passes through unchanged) before every `JSON.parse` call in `hosted.ts`, both for `identifyProduct` and `parseStockUpdate`. Not something Phase 6 could have caught without a live key.

**(c) `applyStockDelta` extracted to `products.ts`; `deductStock` refactored to call it.** Phase 4's `deductStock` and this phase's need for a general increase-or-decrease stock adjustment were about to become two separate implementations of the same "fetch product, clamp at zero, write back" logic — a DRY violation per global-rules §2. Extracted the shared logic into `applyStockDelta(productId, delta)` (signed delta; throws if the product no longer exists) in `products.ts`; `deductStock` is now a thin wrapper (`applyStockDelta(productId, -quantity)`, catching the throw to preserve its own established no-op-on-missing-product contract, since Phase 4's tests and callers depend on that). Verified Phase 3/4's full existing test suite still passes unchanged after this refactor.

**(d) Final `StockUpdate`/`DaySummaryInput`/`DaySummary` shapes** (`src/lib/ai/types.ts`, verbatim):
```ts
export interface StockUpdate {
  productId?: string;
  productNameGuess: string;
  quantityDelta?: number;
  direction: "increase" | "decrease";
}

export interface DaySummaryInput {
  transactions: Transaction[];
  locale: string;
}

export type DaySummary = string;
```

**(e) Parsing approach: JSON-schema-constrained (`responseMimeType`/`responseSchema`), not true function calling** — the fallback the phase file explicitly permitted. Reused Phase 6's already-verified mechanism rather than introducing untested function-calling machinery, especially since (per (b) above) even the "strict" schema-constrained mode isn't perfectly reliable — there was no reason to believe true function calling would fare meaningfully better, and every test in this project already had to be written against mocks regardless (no live key at write-time for the bulk of Phase 7's implementation, before the key arrived).

**(f) `generateSummary` short-circuits locally for zero transactions**, never calling Gemma at all for that case — a deliberate choice (not the "still call the model" alternative the phase file's required-tests wording also allowed). Reasoning: asking a model to "summarize" an empty list risks a hallucinated summary; a canned per-locale message (`NO_SALES_MESSAGES`) is faster, guaranteed accurate, and works fully offline.

## Deviations from Requirements

None beyond the model-id correction and fence-stripping addition above — both are bug fixes surfaced by live testing that Phase 6 couldn't have caught, not departures from what was asked.

## Issues Encountered & How They Were Fixed

**AI/prompt findings (live API):**
- Model id `gemma-4-4b-it` doesn't exist for this account — see Design Decisions (a).
- JSON responses sometimes wrapped in markdown fences despite schema constraints — see Design Decisions (b).
- **A real, unresolved accuracy limitation, honestly reported rather than hidden:** a compound mixed-language message ("nimeongeza sugar 5 bags, sold 2 bread") consistently returned only ONE `StockUpdate` (for "sugar"), silently dropping "sold 2 bread" — even after tightening the prompt to explicitly demand "a SEPARATE entry ... for EVERY distinct product mentioned; do not stop after the first one." Tried once, didn't fix it, and further prompt-engineering iteration was judged not worth open-ended time investment against a hackathon deadline. **This is real, user-facing behavior**: a shopkeeper describing two changes in one message may see only one line proposed. Not silently data-lossy in an unrecoverable way (nothing is applied without the shopkeeper's explicit per-line confirm — PRD §9's confirm-before-commit protection still holds), but worth knowing before a live demo. See "Known Debt."
- **Summary generation latency is well outside the photo-ID 2–6s target**: observed 10.6s (English) and 22.6s (Swahili) for `generateSummary`, versus 2.1–3.3s for `identifyProduct` and 1.5s for `parseStockUpdate`. The PRD §6 2–6s target was scoped to photo-ID specifically (per Phase 6's phase file), not summary generation, so this isn't a violated requirement — but it's a real UX gap (a shopkeeper waiting 10-23s for a summary) worth flagging for Phase 9/10 to consider (e.g. a more patient loading state, or accepting it as a "less time-critical" feature since it's requested on-demand rather than blocking a sale).

**E2E infrastructure (found and fixed while getting this phase's own new E2E test reliable — not really about this phase's feature, but real, and blocking):**
- `e2e/stock-update-and-summary.spec.ts` initially failed because the mock for `/api/parse-stock` returned Gemma's raw internal field name (`matchedProductId`) instead of the route's actual normalized response shape (`StockUpdate`'s `productId`) — a test-authoring bug, fixed by returning the correct shape.
- Running the full suite (grown to 7 specs) intermittently failed 2-5 tests at a time with generic timing errors, each of which passed reliably alone. Root-caused in two parts:
  1. **A long-lived `next start` server process from an earlier, unrelated test invocation was being silently reused** across many subsequent `npx playwright test` runs (`webServer`'s `reuseExistingServer: true`), and its service-worker registration state had degraded over the long session — explaining a service-worker-activation assertion that hung 30-60s+ with zero progress. Killing the stale process (`netstat -ano | findstr :3000`, stop the PID) fixed it immediately; documented in `app-shell.spec.ts` for future debugging.
  2. **Serwist's active service worker was intercepting fetches before Playwright's `page.route()` mock could see them**, letting real requests through to the real (and, for `/api/identify-product`, now genuinely live) backend — caught concretely when an unmocked request hit the real Gemini API and got a real 404 for the (then-wrong) model id. Fixed by setting `serviceWorkers: "block"` as the Playwright config default, with `app-shell.spec.ts` overriding back to `"allow"` since it specifically needs the real service worker.
  3. Also corrected `playwright.config.ts`'s own comments, which (written mid-investigation, before the real causes above were found) had incorrectly attributed the flakiness to generic "CPU contention" and an outer/inner-timeout confusion. The outer/inner-timeout lesson (Playwright's default 30s test timeout can fire before an in-test `expect.poll`'s own configured timeout is reached) was independently real and worth keeping documented; the contention theory was not the actual cause and has been corrected.

## Tests Written

- `src/lib/ai/providers/hosted.test.ts` (extended): `parseStockUpdate` normalizes a well-formed response; returns an entry with no `productId` when unmatched; omits `quantityDelta` (not zero) when the model reports it as `null`; throws `AiTextError` when the `updates` array is missing. `generateSummary` returns the model's text for a day with transactions; returns a sensible message for zero transactions **without calling the model** (asserted via the mock's call count). New: strips a markdown fence before parsing (`identifyProduct`).
- `src/app/api/parse-stock/route.test.ts`: valid text returns parsed `StockUpdate[]`; empty/whitespace text returns a 4xx without calling `gemmaClient`.
- `src/app/api/summary/route.test.ts`: seeded transactions return summary text; an empty transaction list still returns a coherent (mocked) message, not an error.
- `src/app/[locale]/stock-update/page.test.tsx`: parsing renders one editable row per `StockUpdate`; removing a row before applying excludes it — `applyStockDelta` (spied) is called with exactly the remaining row's computed signed delta, not the removed one.
- `e2e/stock-update-and-summary.spec.ts`: seed a product via the real Phase 3 UI, parse a mocked NL update, apply it, confirm the products list reflects the new stock quantity, generate a mocked summary, confirm its text renders.

## How to Run Automated Tests

```bash
npm run test:unit   # includes this phase's tests; no live GEMINI_API_KEY needed, all mocked
npm run test:e2e    # includes stock-update-and-summary.spec.ts; also fully mocked
```

## How to Manually Verify This Phase

Performed for real, against the live API (not just mocked — see "What Was Built" preamble):

1. Ran a standalone smoke script (not part of the committed test suite — a scratch script, deleted after use) calling the real `hostedProvider` logic directly. Confirmed:
   - `identifyProduct`: 2.1–3.3s latency, valid schema-conforming JSON returned (naturally "unknown product" since the test image was a meaningless 1×1 pixel, not a real photo — accuracy against a *real* product photo is still unverified).
   - `parseStockUpdate` mixed-language input **verbatim, not paraphrased**: input `"nimeongeza sugar 5 bags, sold 2 bread"` (against a seeded inventory of `Sugar 1kg` id `abc-123` and `Bread 400g` id `def-456`) → output `{"updates": [{"productNameGuess": "sugar 5 bags", "direction": "increase", "matchedProductId": "abc-123", "quantityDelta": 5}]}`. Correctly parsed the Swahili "nimeongeza" (added) → `"increase"`, matched the right product, got the right quantity — **but silently dropped "sold 2 bread" entirely**, a real limitation (see Issues Encountered).
   - `generateSummary`: English (10.6s) — "Today you made a total of KES 570 in sales. Sugar was your best-selling item, with three units sold. All of your transactions today were made in cash." Swahili (22.6s) — "Leo mauzo yetu yamefikia jumla ya KES 570. Sukari ndiyo bidhaa iliyouzwa zaidi leo. Pia, mauzo yote yamefanyika kwa njia ya pesa taslimu." Both coherent and in the correct language.
2. Walked the real UI (mocked at `/api/parse-stock`/`/api/summary` per the E2E test, not live) for the parse → edit → apply → verify-stock and generate-summary flows — both work end-to-end.

**Still open:** `identifyProduct` against a *real* product photo (not a test pixel) — no physical camera/photo available in this environment.

## Known Debt

- **`parseStockUpdate` drops later items in a compound multi-product message** (see Issues Encountered) — a real, observed accuracy gap, not a code bug. `DEBT(prudent-deliberate)`: shipped as-is given the hackathon timeline; the confirm-before-apply UI means nothing is lost silently (the shopkeeper sees only what was proposed and can always describe missed items in a follow-up message), but this should be called out explicitly before a live demo so the presenter knows to keep example messages to one product at a time, or to prompt-engineer further post-hackathon.
- Summary generation latency (10–23s) is well above the photo-ID target and not addressed in this phase — flagged for Phase 9/10.
- Swahili-review debt list (carried from Phases 1–6) gains this phase's `stockUpdate`/`summary` namespaces and two new `shell` keys.
- E2E test suite growing in count — worth Phase 10 revisiting whether `workers: 2` remains the right balance as more specs are added.

## Handoff Notes for Phase 8

- `lib/ai/` is stable — Phase 8 doesn't touch it. No half-finished AI work is left dangling.
- **The corrected model id (`gemma-4-26b-a4b-it`) and the fence-stripping fix apply retroactively to Phase 6's `identifyProduct` too** — if anyone re-reads Phase 6's overview.md in isolation, it will describe the old (wrong) model id; this file is the current source of truth for `hosted.ts`'s actual state.
- **`GEMINI_API_KEY` is now live in `.env.local`.** `NEXT_PUBLIC_CONVEX_URL` is still not set (Convex remains unconnected — Phase 5's gap is unchanged). Phase 8 needs `PAYSTACK_SECRET_KEY`/`PAYSTACK_PUBLIC_KEY`, neither of which are set either — expect the same "write and test everything against mocks, flag what's unverified" posture Phases 5/6 established, unless those arrive too.
- `playwright.config.ts` now blocks service workers by default for all specs except `app-shell.spec.ts` — any new Phase 8 E2E spec that mocks an API route should rely on this (already the default; no per-file action needed unless a new spec specifically needs the real service worker, which is unlikely).
- If a future E2E run exhibits a long, generic-looking hang (not a clear assertion mismatch), check for a stale `next start` process on port 3000 before assuming a test or app bug — see `app-shell.spec.ts`'s comment for the exact symptom and fix.
