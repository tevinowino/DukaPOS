# Phase 6 — Gemma 4 Vision: photo-based product identification

> Audience: implementing AI agent. Read [`plan/global-rules.md`](../global-rules.md) and Phase 5's `overview.md` first. Follow the steps in order.
>
> **Research-verified facts (do not re-derive from training data):**
> - Node/TypeScript SDK: `npm install @google/genai`. Client: `import { GoogleGenAI } from '@google/genai'; const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });`
> - Text/vision call: `await ai.models.generateContent({ model: 'gemma-4-26b-a4b-it', contents: [...] })`. `contents` accepts a mix of plain strings and typed parts; for an image, pass a part built from raw bytes and a MIME type (the Python example confirmed is `types.Part.from_bytes({ data, mimeType })` — confirm the exact JS/TS equivalent helper name against `https://github.com/googleapis/js-genai` at implementation time, since the JS SDK's part-construction API name was not directly confirmed and may differ slightly from the Python one; **this one detail is unverified — verify it against the SDK's own TypeScript types/README before writing `providers/hosted.ts`, do not guess**).
> - Available hosted model ids confirmed: `gemma-4-26b-a4b-it`, `gemma-4-31b-it`, `gemma-4-12b-it`, `gemma-4-4b-it` (smallest/fastest — consider this one for the target 2–6s latency PRD §6 requires, and confirm empirically which one hits that budget; document the choice).
> - Auth: `GEMINI_API_KEY` env var, obtained from `aistudio.google.com/apikey`.
> - Function calling / structured output: define `FunctionDeclaration`s, pass via `tools: [{ functionDeclarations: [...] }]` in a `GenerateContentConfig`; the model returns calls at `response.candidates[0].content.parts[...].functionCall`. This phase's vision use case may not need function calling (a single structured JSON guess is enough) — Phase 7's text-parsing use case is the one that benefits most from it; if this phase finds a simpler direct-JSON-response approach cleaner, prefer it and document the choice, since `types.ts`'s `ProductGuess` shape is what actually matters, not the mechanism that produced it.

## 1. Objective

When this phase is done: a shopkeeper can photograph an unbarcoded item; the photo is compressed client-side, sent to `/api/identify-product`, identified by Gemma 4 vision into a name/category/estimated price guess, and shown to the shopkeeper to confirm or edit before it's saved as a `Product` with `source: 'photo'`. The AI's guess is never auto-committed (PRD §9 risk mitigation). This phase also establishes the `lib/ai/` adapter pattern (`gemmaClient.ts`, `types.ts`, `providers/hosted.ts`, `providers/selfhosted.ts`) that Phase 7 extends.

## 2. Read First

- `PRD.md` §5 "Gemma 4-Powered Assistance" (photo ID bullet), §6 (2–6s target latency, graceful degradation), §9 (AI output always shown for confirmation, never auto-committed)
- `ARCHITECTURE.md` §4.3 (`lib/ai/` structure), §5.1 (unbarcoded product add flow)
- Phase 3 `overview.md` (final `Product`/`addProduct` shape — this phase's confirm step calls it with `source: 'photo'`) and Phase 5 `overview.md` (whether/how to enqueue offline-deferred AI actions)

## 3. Deliverables

| Path | Purpose |
|---|---|
| `src/lib/ai/types.ts` | `ProductGuess` (`name`, `category`, `estimatedPriceKES`, `confidence?`) and the shared provider interface (`identifyProduct(imageBytes, mimeType): Promise<ProductGuess>`) |
| `src/lib/ai/gemmaClient.ts` | Selects `providers/hosted.ts` or `providers/selfhosted.ts` based on `AI_PROVIDER`; this is the only file the rest of the app imports from `lib/ai/` |
| `src/lib/ai/providers/hosted.ts` | Calls Gemma 4 via `@google/genai` per the Research-verified facts block; normalizes the raw model response into `ProductGuess` |
| `src/lib/ai/providers/selfhosted.ts` | Stub: same interface, throws a clear "not configured" error or calls `SELFHOSTED_AI_URL` if set — full implementation only if time allows; PRD/ARCHITECTURE treat this as a fallback only needed if organizers require self-hosting, not a hackathon-day requirement |
| `src/app/api/identify-product/route.ts` | `POST` accepting an image (multipart or base64 JSON — pick one, document it), calls `gemmaClient.identifyProduct`, returns the `ProductGuess` |
| `src/components/PhotoCapture.tsx` | `<input type="file" capture="environment">`-based capture (per ARCHITECTURE.md §4.1), client-side image compression before upload |
| `src/app/[locale]/products/new/photo/page.tsx` | Photo-add flow: capture → loading state → confirm/edit form (reuses Phase 3's `ProductForm`) → save |

## 4. Implementation Steps (in order)

1. **Write `types.ts` first, docstring-first**, since both provider files and Phase 7's additions depend on this shape being right before any implementation.
2. **Write `providers/hosted.ts`.** Verify the exact JS/TS image-part construction against the `@google/genai` package's own types (`node_modules/@google/genai/**/*.d.ts` or its README) before writing this — the Research-verified facts block flags this specific detail as unverified. Prompt design: ask for a strict JSON response (name, category, estimated price in KES) — if using plain-JSON-in-prompt rather than function calling (acceptable per the facts block), parse defensively and throw a typed error on malformed output rather than letting a parse exception bubble up raw.
3. **Write `providers/selfhosted.ts`** as a minimal stub matching the interface — do not spend hackathon time building a real RunPod/FastAPI backend unless explicitly directed; its job here is to prove the adapter pattern actually isolates the switch to one env var, not to be feature-complete.
4. **Write `gemmaClient.ts`** — a single `if (process.env.AI_PROVIDER === 'selfhosted')` switch, nothing else. No caller anywhere else in the app imports `providers/*` directly (enforce this by not exporting them from an index that leaks them, and by code-reviewing your own `/api/identify-product/route.ts` to confirm it only imports `gemmaClient`).
5. **Client-side image compression.** Before the photo is sent to `/api/identify-product`, resize/compress it (e.g. draw to a `<canvas>` and re-export as JPEG at a bounded max dimension and quality) — this matters both for the 2–6s latency target and for users on limited data plans (PRD's core user context). Document the exact dimensions/quality chosen.
6. **Build `/api/identify-product/route.ts`.** Validate the incoming payload (size limit, mime type) before calling `gemmaClient` — reject oversized/invalid uploads with a clear 4xx, don't let a bad upload reach the AI call. On any Gemma error (timeout, malformed response, quota), return a typed error the client can render as "couldn't identify this — add manually" rather than a raw 500.
7. **Build `PhotoCapture.tsx` and the photo-add page.** Loading state while the request is in flight (explicitly required — PRD §9 risk: "test hosted endpoint ahead of time; show clear loading state"); on success, pre-fill `ProductForm` with the guess (editable, not read-only) and save via Phase 3's `addProduct` with `source: 'photo'` on confirm; on failure, fall back to the plain manual-add form with a visible explanation, never a dead end.
8. **Verify:** photograph a real item (or use a static test image locally), confirm a plausible guess appears within the target latency, edit a field, save, confirm it appears in the products list with `source: 'photo'`.

## 5. Edge Cases & Required Handling

| Edge case | Required handling |
|---|---|
| `GEMINI_API_KEY` missing/invalid | `/api/identify-product` returns a clear typed error (not a raw provider stack trace); the UI falls back to manual add with an explanatory message. Test it. |
| Gemma returns malformed/non-JSON text | `providers/hosted.ts` catches the parse failure and throws a typed `AiIdentifyError`, not an uncaught exception; the route maps this to the same 4xx-with-message behavior as the missing-key case. Test it with a mocked malformed response. |
| Request takes longer than a defined timeout (network stall, provider hang) | The route enforces a timeout (document the exact duration chosen, informed by the 2–6s target plus headroom) and returns a timeout-specific error rather than hanging the shopkeeper's UI indefinitely. Test it with a mocked never-resolving call plus a short test-only timeout override. |
| Photo taken while offline | `PhotoCapture`/the photo-add page detects offline state before attempting the network call and shows "AI identification needs a connection — add manually, or we'll try again once you're back online" rather than a failed-fetch error; per Phase 5's overview handoff, follow whichever queuing pattern it documented (or, if it documented "AI actions just retry, don't queue," implement that instead — do not silently invent a third pattern). Test the offline-detection branch. |
| Confirm/edit step: shopkeeper changes every field the AI guessed | Saving must use the edited values, not the original guess — the form's edited state is the source of truth on save, the `ProductGuess` was only ever a starting point. Test it. |

## 6. Required Tests

- `src/lib/ai/types.ts` — no logic to test directly, but confirm via `providers/hosted.test.ts` that real provider output is normalized into exactly this shape.
- `src/lib/ai/providers/hosted.test.ts` (mocking the `@google/genai` client at the module boundary, not hitting the real API): a well-formed model response normalizes into a `ProductGuess` with the expected fields; a malformed/non-JSON response results in a thrown `AiIdentifyError` (or equivalent typed error), not an unhandled exception.
- `src/lib/ai/gemmaClient.test.ts`: with `AI_PROVIDER=hosted`, calls route to `providers/hosted`'s implementation (mock both providers, assert which was invoked); with `AI_PROVIDER=selfhosted`, routes to `providers/selfhosted`'s implementation.
- `src/app/api/identify-product/route.test.ts`: a valid image payload returns a 200 with a `ProductGuess`-shaped body (mock `gemmaClient`); an oversized/invalid-mime payload returns a 4xx without calling `gemmaClient` at all; a `gemmaClient` rejection is mapped to a typed error response, not a raw 500 with a stack trace.
- `src/components/PhotoCapture.test.tsx`: selecting a file triggers the compression step and calls `onCapture` with the compressed result (assert the output is smaller than a large synthetic input, or at minimum that the compression function was invoked — document which assertion style you used).
- `e2e/photo-product-id.spec.ts` (Playwright, mocking `/api/identify-product` at the network level so the test doesn't depend on the real Gemma API or a real camera): simulate the file-capture input, confirm the loading state appears, confirm the confirm/edit form pre-fills from the mocked guess, edit a field, save, confirm the product appears in the list with the edited value (not the original guess).

## 7. Phase Rules

- No other part of the codebase imports `providers/hosted.ts` or `providers/selfhosted.ts` directly — only `gemmaClient.ts` does. This is the whole point of ADR-driven provider isolation in `ARCHITECTURE.md` §4.3; a violation here is a design failure, not a style nit.
- Do not build the self-hosted RunPod/FastAPI backend itself in this phase (or at all, unless explicitly directed later) — `providers/selfhosted.ts` only needs to satisfy the interface.
- Do not implement text-based stock parsing or summaries here — that's Phase 7, even though it shares `lib/ai/` files. Extend, don't duplicate, when Phase 7 arrives.
- AI output is never auto-saved. Every path through this phase's UI requires an explicit confirm action before `addProduct` is called.

## 8. Definition of Done

1. A human can photograph (or, in a non-camera test environment, select a static test image via the file input) an item, see a loading state, see an editable AI guess, edit at least one field, confirm, and see the product saved with `source: 'photo'` and the edited values.
2. All §6 tests green; `npm run lint` and `npm run build` clean; `GEMINI_API_KEY`, `AI_PROVIDER`, `SELFHOSTED_AI_URL` present in `.env.local.example`.
3. `overview.md` completed, including: the exact `@google/genai` image-part construction that worked (resolving the one unverified detail flagged above); the model id actually used and observed latency; the exact `ProductGuess` shape pasted verbatim (Phase 7 doesn't need this one, but Phase 10's audit will check both `lib/ai/types.ts` exports); the client-side compression dimensions/quality chosen.
