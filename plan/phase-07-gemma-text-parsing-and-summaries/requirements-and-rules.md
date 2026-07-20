# Phase 7 — Gemma 4 Text: natural-language stock updates & plain-language summaries

> Audience: implementing AI agent. Read [`plan/global-rules.md`](../global-rules.md) and Phase 6's `overview.md` first. Follow the steps in order. This phase **extends** `src/lib/ai/types.ts` and `gemmaClient.ts` — read Phase 6's exact exports before adding anything, to avoid collisions.

## 1. Objective

When this phase is done: a shopkeeper can type a free-text stock update in English, Swahili, or mixed language (e.g. "nimeongeza 5 sugar" / "sold 3 bread today" / "add 10 bags of rice"), have it parsed into structured `StockUpdate[]` changes they confirm before anything is applied to `Product` records; and can request or automatically receive a plain-language end-of-day summary of the day's transactions. Like Phase 6, AI output is confirmed, never auto-committed for stock changes; the summary is read-only text, so no confirm step applies to it.

## 2. Read First

- `PRD.md` §5 "Gemma 4-Powered Assistance" (NL parsing and summary bullets), §9 (Swahili quality risk — human review, not machine-translate, applies to *static UI copy* in Phase 9; this phase's AI-generated text is inherently per-request and not pre-translated, per `ARCHITECTURE.md` §4.1)
- `ARCHITECTURE.md` §5.2 (NL stock update flow)
- Phase 6 `overview.md` — exact current contents of `lib/ai/types.ts` and `gemmaClient.ts`, and the model id/latency findings (reuse the same model choice unless there's a reason not to)

## 3. Deliverables

| Path | Purpose |
|---|---|
| `src/lib/ai/types.ts` (extended) | Add `StockUpdate` (`productId?`, `productNameGuess`, `quantityDelta`, `direction: 'increase' | 'decrease'`) and `DaySummaryInput`/`DaySummary` shapes |
| `src/lib/ai/gemmaClient.ts` (extended) | Add `parseStockUpdate(text, existingProducts): Promise<StockUpdate[]>` and `generateSummary(transactions): Promise<string>` to the client interface, routed through the same provider switch |
| `src/lib/ai/providers/hosted.ts` (extended) | Implements both new methods |
| `src/lib/ai/providers/selfhosted.ts` (extended) | Stub implementations matching the interface, same posture as Phase 6 |
| `src/app/api/parse-stock/route.ts` | `POST` text → `StockUpdate[]` |
| `src/app/api/summary/route.ts` | `POST` (recent transactions, or a date) → summary text |
| `src/app/[locale]/stock-update/page.tsx` | Text input → parsed changes shown as an editable/confirmable list → apply |
| `src/app/[locale]/summary/page.tsx` (or a section on the transactions page) | Displays the generated end-of-day summary, with a manual "regenerate" action |

## 4. Implementation Steps (in order)

1. **Design `parseStockUpdate`'s prompt to disambiguate against existing inventory.** Pass the shop's current product names/ids (from Dexie) into the prompt so "add 5 sugar" can resolve to the specific existing `Product` (`Sugar 1kg`) rather than guessing a new one — this is why the function signature takes `existingProducts`, not just raw text. When the model can't confidently match an existing product, it should return a `StockUpdate` with `productId: undefined` and a `productNameGuess`, letting the confirm UI ask the shopkeeper to pick or create.
2. **Use function calling for this endpoint specifically** (contrast with Phase 6's simpler JSON-in-prompt choice) since `parseStockUpdate` benefits from a strict schema over free-form model text — define a function declaration whose parameters match `StockUpdate[]`'s shape, per the Research-verified facts in Phase 6's file (`tools: [{functionDeclarations:[...]}]`, response read from `response.candidates[0].content.parts[...].functionCall`). If this proves more complex than it's worth under time pressure, plain JSON-in-prompt (Phase 6's approach) is an acceptable fallback — document whichever you actually used and why.
3. **Build `/api/parse-stock/route.ts`** — validates input text length (reject empty/absurdly long input before calling the model), loads the shop's current product list to pass as context, calls `gemmaClient.parseStockUpdate`, returns the structured result. Same error-mapping discipline as Phase 6 (typed errors, not raw provider exceptions).
4. **Build the stock-update page.** Text input (placeholder examples in both English and Swahili so shopkeepers know the format is flexible) → loading state → a list of proposed changes, each showing the matched/guessed product and the delta, each individually editable or removable before a single "apply all" confirm → on confirm, apply each via Phase 3's `updateProduct`/stock-adjustment path (reuse it, don't reimplement stock math here).
5. **Design `generateSummary`.** Takes the day's `Transaction[]` (from Phase 4's `listTransactions`), returns a short plain-language paragraph (total sales, top-selling item, any notable pattern) generated in whatever language matches the shopkeeper's current UI locale (not necessarily English) — pass the target language explicitly in the prompt rather than assuming the model infers it correctly from context alone.
6. **Build `/api/summary/route.ts`** and the summary UI — a simple "Today's Summary" view, generated on demand (button) or automatically once at end-of-day is a nice-to-have; on-demand generation is the required baseline for this phase given time constraints.
7. **Verify:** type "sold 2 bread, add 10 rice" against a seeded inventory, confirm plausible structured changes appear, edit one, confirm, verify stock updated correctly; generate a summary for a day with a few seeded transactions, confirm it reads as a coherent plain-language paragraph.

## 5. Edge Cases & Required Handling

| Edge case | Required handling |
|---|---|
| Input text mixing English and Swahili in one sentence ("nimeongeza sugar 5 bags") | Parses correctly per PRD's explicit mixed-language requirement — this is a prompt-design concern, test it with at least one concrete mixed-language example. |
| Text referencing a product that doesn't exist in inventory at all ("sold 3 phone chargers" when nothing like that exists) | Returned as a `StockUpdate` with no matched `productId`, surfaced to the shopkeeper as "couldn't match this to an existing product — create it, or skip this line" rather than silently dropped or incorrectly matched to something unrelated. Test it. |
| Ambiguous quantity ("added more sugar" — no number) | The model may return an update with an uncertain/missing quantity; the confirm UI must require an explicit quantity before that line can be applied (block just that line, not the whole batch). Test it. |
| Empty or whitespace-only input submitted | Rejected client-side before any network call. Test it. |
| `generateSummary` called for a day with zero transactions | Returns a short, sensible "no sales recorded today" message rather than an empty string or a hallucinated summary. Test it. |
| Applying a confirmed batch where one line's product was deleted between parse-time and confirm-time (rare race, but possible in a multi-tab scenario) | That specific line fails gracefully with a visible per-line error; the rest of the batch still applies. Test it. |

## 6. Required Tests

- `src/lib/ai/providers/hosted.test.ts` (extended, mocking `@google/genai`): `parseStockUpdate` with a mocked well-formed function-call response normalizes into `StockUpdate[]` correctly; a response with no matched product returns an entry with `productId: undefined` and a populated `productNameGuess`; `generateSummary` with a mocked response returns the model's text, and with zero input transactions still calls the model (or short-circuits — document which) and returns a non-empty sensible string either way.
- `src/app/api/parse-stock/route.test.ts`: valid text returns parsed `StockUpdate[]` (mock `gemmaClient`); empty text returns a 4xx without calling `gemmaClient`.
- `src/app/api/summary/route.test.ts`: a request with seeded transaction data returns summary text (mock `gemmaClient`); a request with an empty transaction list still returns a coherent message, not an error.
- `src/app/[locale]/stock-update/page.test.tsx`: entering text and receiving a mocked parse result renders one editable row per `StockUpdate`; removing a row before confirming excludes it from the applied changes; confirming calls the underlying stock-adjustment function with exactly the remaining rows' values.
- `e2e/stock-update-and-summary.spec.ts` (Playwright, mocking `/api/parse-stock` and `/api/summary` at the network level): type a concrete NL update against a seeded product, confirm the proposed change, verify the product list reflects the new stock quantity; navigate to the summary view, confirm summary text renders.

## 7. Phase Rules

- Extend `lib/ai/types.ts` and `gemmaClient.ts` in place — do not create parallel `types2.ts` or a second client file. If a naming collision with Phase 6's exports arises, resolve it by renaming clearly (document the rename in `overview.md`), not by forking the module.
- No voice input (explicitly out of scope per PRD §4).
- Summary generation is on-demand for this phase; do not build a scheduled/automatic end-of-day trigger (no cron, no background timer) — out of scope for the hackathon timeline.
- Reuse Phase 3's stock-adjustment function for applying confirmed changes — do not write a second stock-mutation code path.

## 8. Definition of Done

1. A human can type a natural-language stock update (including at least one mixed-language example during manual verification), see a confirmable structured breakdown, apply it, and see inventory update correctly; and can generate a plain-language summary for a day with seeded transactions.
2. All §6 tests green; `npm run lint` and `npm run build` clean.
3. `overview.md` completed, including: the final `StockUpdate`/`DaySummary` shapes pasted verbatim; whether function calling or JSON-in-prompt was used for parsing and why; at least one real mixed-language input/output example observed during manual testing, pasted verbatim (not paraphrased) so later reviewers can judge quality.
