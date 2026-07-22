# Phase 6 — Overview (completed by the implementing agent)

## Status

- [x] All deliverables built
- [x] All required tests green
- [x] Lint + typecheck clean
- Completed on: `2026-07-21`

**⚠️ No `GEMINI_API_KEY` was available in this environment** (same situation as Phase 5's Convex deployment — no interactive way to obtain one here). All required tests mock `@google/genai` at the module boundary and pass with zero live API calls. The model id, prompt, and JSON-schema-constrained response format are implemented per verified SDK types, but **latency and real-world accuracy are unverified** — see Design Decisions (b) and Handoff Notes.

**UPDATE from Phase 7 (2026-07-22):** a real `GEMINI_API_KEY` became available and Phase 7 ran live smoke tests. Two corrections to what's described below, made in `src/lib/ai/providers/hosted.ts` (shared by this phase and Phase 7 — one fix covers both): **(1)** the model id chosen here, `gemma-4-4b-it`, does not actually exist for this account (`404 NOT_FOUND`) — only `gemma-4-26b-a4b-it` and `gemma-4-31b-it` are real; the code now uses `gemma-4-26b-a4b-it`. **(2)** the model was observed wrapping JSON responses in a markdown code fence despite `responseMimeType: "application/json"`; a defensive `stripJsonFence` step was added before every `JSON.parse`. See Phase 7's overview.md ("Design Decisions" (a)/(b) and "How to Manually Verify This Phase") for the full detail, verbatim live-test output, and latency figures. Treat *this* file's model id and "unverified" framing below as historical — Phase 7's file is the current source of truth for `hosted.ts`'s actual state.

## What Was Built

- `src/lib/ai/types.ts` — `ProductGuess`, `AiIdentifyError`, `AiProvider` interface.
- `src/lib/ai/providers/hosted.ts` — calls Gemma 4 via `@google/genai`, forces structured JSON output via `responseMimeType`/`responseSchema` (see Design Decisions (a) — not plain prompt-engineered JSON).
- `src/lib/ai/providers/selfhosted.ts` — stub satisfying the interface, per Phase Rules.
- `src/lib/ai/gemmaClient.ts` — the one-env-var provider switch; nothing else in the app imports a provider directly.
- `src/lib/media/compressImage.ts` — client-side canvas-based downscale + JPEG re-encode, extracted as its own testable module (not inlined in `PhotoCapture.tsx` — see Design Decisions (d)).
- `src/components/PhotoCapture.tsx` — `capture="environment"` file input, compresses before `onCapture` fires.
- `src/app/api/identify-product/route.ts` — multipart upload (see Design Decisions (c)), size/mime validation before calling `gemmaClient`, 15s timeout, typed error mapping.
- `src/app/[locale]/products/new/photo/page.tsx` — capture → identifying → confirm/edit (reuses `ProductForm`) → save, with an offline-detection branch.
- `src/app/[locale]/products/new/page.tsx` (modified) — added the "Add via photo" entry point.
- `messages/en.json`, `messages/sw.json` (extended) — `photoCapture`, `photoProduct` namespaces, plus `products.addViaPhotoButton`.
- Tests: `src/lib/ai/providers/hosted.test.ts`, `src/lib/ai/gemmaClient.test.ts`, `src/app/api/identify-product/route.test.ts`, `src/components/PhotoCapture.test.tsx`.
- `e2e/photo-product-id.spec.ts` — full mocked-API journey with a real (tiny, valid) PNG, since Playwright runs real Chromium where `createImageBitmap`/canvas genuinely execute (unlike jsdom).

## Design Decisions & Rationale

**(a) Structured JSON via `responseMimeType`/`responseSchema`, not plain-prompt JSON or function calling.** Verified in `@google/genai`'s own types (`node_modules/@google/genai/dist/genai.d.ts`) that `GenerateContentConfig` supports `responseMimeType: "application/json"` + `responseSchema` (an OpenAPI-subset `Schema`/`Type.OBJECT` shape) to constrain the model's output directly — more reliable than asking nicely in the prompt, and simpler than full function-calling machinery for a single-object response. `providers/hosted.ts` still defensively parses and validates the result (`normalizeProductGuess`) rather than trusting the schema constraint blindly, since malformed responses are explicitly a required edge case to handle.

**(b) Model id: `gemma-4-4b-it`** (smallest/fastest of the four confirmed hosted ids: `gemma-4-4b-it`, `gemma-4-12b-it`, `gemma-4-26b-a4b-it`, `gemma-4-31b-it`), chosen for PRD §6's 2–6s latency target. **Not empirically benchmarked** — no `GEMINI_API_KEY` available. This is a real open item; see Handoff Notes.

**(c) Upload format: multipart `FormData`, not base64 JSON.** `PhotoCapture` already produces a `Blob` (from canvas compression); sending it as a `FormData` field avoids a base64-encoding round trip (which would add ~33% payload size for no benefit) and is Next.js Route Handlers' natural fit via `request.formData()`.

**(d) `compressImage` extracted to its own module** (`src/lib/media/compressImage.ts`), not inlined in `PhotoCapture.tsx`. Two reasons: global-rules §2 ("pure logic lives in pure functions"), and — practically — jsdom has no real canvas/`createImageBitmap` backend, so a component test can't exercise real compression; extracting it as a separately-mockable module let `PhotoCapture.test.tsx` assert the *integration* (file selected → `compressImage` called with it → `onCapture` called with its result) without needing a fake canvas pipeline. The real compression logic itself is only exercised in the real-Chromium E2E test.

**(e) Offline handling: "just retry, don't queue"** — resolving the ambiguity Phase 5's overview.md left open. AI identification is a live service call, not a data write; queuing a photo (a binary blob, unlike the small JSON payloads `syncQueue` is designed for) through the same sync-queue engine would be a poor fit and isn't what the edge case's own suggested message text implies ("we'll try again once you're back online" — i.e., the shopkeeper retries by pressing the button again, not an automatic background drain). `products/new/photo/page.tsx` detects `navigator.onLine` before attempting the call and shows a clear message; no queue entry is ever created for a failed/skipped photo-ID attempt.

**(f) Final `ProductGuess` shape** (`src/lib/ai/types.ts`, verbatim):
```ts
export interface ProductGuess {
  name: string;
  category: string;
  estimatedPriceKES: number;
  confidence?: number;
}
```

## Deviations from Requirements

None — the one flagged "unverified" detail from the phase file (exact `@google/genai` image-part construction) was resolved by reading the SDK's own types directly (`createPartFromBase64(data: string, mimeType: string): Part`, exported from the package root), not guessed. See Issues Encountered for the verification trail.

## Issues Encountered & How They Were Fixed

- **The exact image-part construction API differed from the Python example given.** The phase file flagged `types.Part.from_bytes({data, mimeType})` (Python) as needing JS/TS verification. Checked `node_modules/@google/genai/dist/genai.d.ts` directly: the real exported helper is `createPartFromBase64(data: string, mimeType: string): Part` (a **base64 string**, not raw bytes/ArrayBuffer) — a top-level exported function, not a static method on a `Part` class. `Buffer.from(imageBytes).toString("base64")` converts the route's `Uint8Array` before calling it. Also discovered and used `createUserContent(parts)` (builds the full `Content` object from a mixed array of `Part`s and strings) and `response.text` (a convenience getter that concatenates all text parts from the first candidate) — both real, verified exports, not guessed.
- **Mocking `GoogleGenAI` as a constructor in `hosted.test.ts`** initially failed (`"... is not a constructor"`) because `vi.fn().mockImplementation(() => ({...}))` used an arrow function, which can't be invoked with `new`. Fixed by using a regular `function` expression assigning to `this` instead.

## Tests Written

- `src/lib/ai/providers/hosted.test.ts`: a well-formed mocked response normalizes into a `ProductGuess`; non-JSON response text throws `AiIdentifyError`; valid-JSON-but-missing-required-fields throws `AiIdentifyError`; a missing `GEMINI_API_KEY` throws `AiIdentifyError` without ever calling the mocked SDK.
- `src/lib/ai/gemmaClient.test.ts`: `AI_PROVIDER=hosted` routes to the hosted provider only; `AI_PROVIDER=selfhosted` routes to the selfhosted provider only.
- `src/app/api/identify-product/route.test.ts` (`// @vitest-environment node`): a valid image returns 200 + `ProductGuess` body; an unsupported mime type returns 4xx without calling `gemmaClient`; an oversized image returns 4xx without calling `gemmaClient`; a `gemmaClient` rejection maps to a 502 with the error's message, not a raw 500.
- `src/components/PhotoCapture.test.tsx`: selecting a file calls the (mocked) `compressImage` with that exact file, and `onCapture` with its (mocked) compressed result.
- `e2e/photo-product-id.spec.ts`: full journey with a real tiny PNG through real Chromium's compression pipeline — mocked `/api/identify-product` response, loading state visible, confirm form pre-fills from the guess, edited values (not the original guess) are what's saved and shown in the product list.

## How to Run Automated Tests

```bash
npm run test:unit   # includes all of this phase's tests — zero live GEMINI_API_KEY needed, all mocked
npm run test:e2e    # includes the photo-product-id journey — also fully mocked at /api/identify-product
```

## How to Manually Verify This Phase

**Could not be fully performed — no `GEMINI_API_KEY` available in this environment.** What was verified:
1. With `/api/identify-product` mocked, walked the full UI flow (photo select → loading → pre-filled confirm form → edit → save) — confirmed the saved product shows the *edited* values and `source: "photo"` in IndexedDB.
2. Confirmed `GEMINI_API_KEY` missing behaves as required: the route returns a typed 502 with a clear message, not a raw provider stack trace.

**Still needed once a real key is available** (flagging explicitly, not skipping silently):
3. Photograph a real product, confirm a plausible guess appears, and measure actual latency against the 2–6s target with `gemma-4-4b-it` — if it's too slow or inaccurate, reconsider the model id (see Design Decisions (b)).
4. Confirm the `responseSchema`-constrained JSON output actually behaves as documented against the live API (schema constraints are a real API feature per the SDK's types, but this project has never made a live call to confirm the *hosted service* honors it as strictly as the type signature implies).

## Known Debt

- Model choice (`gemma-4-4b-it`) and the whole hosted-provider prompt/schema are unverified against a live API call — see "How to Manually Verify This Phase" above. Not a code shortcut (the implementation follows verified SDK types precisely), but an untested assumption about real-world model behavior/latency.
- Swahili-review debt list (carried from Phases 1–5) gains this phase's `photoCapture`/`photoProduct` namespaces and `products.addViaPhotoButton`.

## Handoff Notes for Phase 7

- `src/lib/ai/types.ts` and `gemmaClient.ts` are stable and ready to extend. Phase 7 adds `StockUpdate`/`DaySummary` types and `parseStockUpdate`/`generateSummary` functions — extend the same files, don't fork them (Phase Rules already say this, restating per the plan's own convention of flagging it in both directions).
- `gemmaClient.ts`'s current shape is a single top-level `identifyProduct` export, not an object/class — Phase 7's new functions should follow the same flat-export pattern (`export function parseStockUpdate(...)`, `export function generateSummary(...)`) for consistency, not bundle everything into a client object partway through.
- **Once a real `GEMINI_API_KEY` is available, re-run this phase's manual verification (items 3–4 above) before relying on the photo-ID feature in an actual demo** — this is the single most important open item this phase leaves behind.
- The offline "just retry, don't queue" decision (Design Decisions (e)) applies to Phase 7's text-parsing/summary features too, unless Phase 7 finds a specific reason to diverge — if it does, it should say so explicitly, per this same phase file's own instruction not to silently invent a third pattern.
