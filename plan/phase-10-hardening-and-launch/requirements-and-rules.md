# Phase 10 — Hardening & Launch: E2E journeys, security audit, performance check, deployment runbook

> Audience: implementing AI agent. Read [`plan/global-rules.md`](../global-rules.md) and **every previous phase's `overview.md`** first — this phase audits the whole system, so it needs the full history, not just the immediately preceding phase.

## 1. Objective

When this phase is done: the full shopkeeper journey (onboard → add products via all three methods → record cash and M-Pesa sales → NL stock update → daily summary → offline/online cycling) is covered by Playwright E2E tests; a written security audit confirms the `shopId`-scoping model holds everywhere Convex is touched and no secret ever reaches the client bundle; performance is verified against `PRD.md` §6's stated targets; and a deployment runbook exists that a judge/organizer (or the author, hours before demo) can follow cold to get the app live on Vercel with sandbox Paystack and a real Convex deployment.

## 2. Read First

- `PRD.md` in full (re-read as a checklist — every "In scope (MVP)" bullet in §4 should map to something demonstrably built)
- `ARCHITECTURE.md` in full, including all ADRs in §9
- Every phase's `overview.md`, specifically collecting: every `DEBT(prudent-deliberate)` entry recorded, every "genuinely unsure" item (Phase 9), the resolved-but-initially-unverified facts from Phase 6 (image-part API) and Phase 8 (amount format, webhook event name)

## 3. Deliverables

| Path | Purpose |
|---|---|
| `e2e/full-shopkeeper-journey.spec.ts` | One comprehensive Playwright spec covering onboarding through a full day's activity (see §4 step 2) |
| `docs/SECURITY_AUDIT.md` | Written report: every Convex function's `shopId` scoping verified, every secret's location confirmed server-only, webhook verification confirmed, findings ranked by severity, each with a resolution or an explicit accepted-risk note (cross-referencing the ADR-2 `shopId` debt where relevant, not re-flagging it as new) |
| `docs/PERFORMANCE_NOTES.md` | Measured results against PRD §6's targets (barcode lookup near-instant, photo ID 2–6s, offline core loop fully functional) with the method used to measure each |
| `docs/DEPLOYMENT.md` | Step-by-step: Vercel project setup, all env vars from `global-rules.md`'s registry, Convex production deployment, Paystack webhook URL configuration, a smoke-test checklist for immediately after deploy |
| `PROVIDER_SWITCHING.md` | Per `ARCHITECTURE.md` §8, documents the one-env-var (`AI_PROVIDER`) switch for judges/organizers who require self-hosting |

## 4. Implementation Steps (in order)

1. **Collect every phase's open items first.** Before writing new tests/audits, compile a single list from every `overview.md`'s "Known Debt" and any "genuinely unsure"/unverified items — this becomes the seed list for the security audit's and this phase's own final report to the user.
2. **Write the full-journey E2E spec.** One continuous Playwright test (or a small serial suite using `test.describe.serial` if that reads more clearly) walking: fresh onboarding → add one product manually → add one product via barcode (or the manual-entry fallback if no camera, consistent with Phase 3's approach) → add one product via photo (mocking `/api/identify-product` at the network level, consistent with Phase 6's approach) → record one cash sale → record one M-Pesa sale (mocking Paystack/webhook at the network level, consistent with Phase 8's approach, since a real sandbox STK push isn't practical inside an automated CI run) → issue one NL stock update → view the daily summary → go offline, confirm the shell and existing data are still usable → go back online, confirm sync status recovers. This is deliberately comprehensive; if any step reveals a genuine bug (not a test-authoring issue), fix the underlying code — this phase owns bug fixes surfaced by hardening, not just documentation.
3. **Write the security audit.** Walk every `convex/*.ts` function and confirm it takes and filters by `shopId`; confirm no client component imports a Convex client; confirm `GEMINI_API_KEY`/`PAYSTACK_SECRET_KEY`/`CONVEX_DEPLOY_KEY` never appear in any file under `src/app/**` that isn't a Route Handler, and never in any `NEXT_PUBLIC_*` variable; confirm the webhook signature check runs against the raw body (re-verify Phase 8's specific test for this still passes); confirm the PIN is hashed, not plaintext, in the actual running app (not just the unit test) by inspecting IndexedDB manually. Rank findings by severity; for each, either it's fixed in this phase or explicitly accepted with a one-line reason (the ADR-2 `shopId` debt is the expected example of the latter — do not "fix" it by adding auth, that's out of scope, just confirm it's still accurately documented).
4. **Write the performance notes.** Measure: time from barcode detection to product-form pre-fill (should feel instant — local Dexie lookup, no network); time from photo capture to AI guess appearing (compare against the 2–6s target, using whatever model Phase 6 settled on); confirm the core loop (view stock, add product, record cash sale) works with DevTools fully offline and the service worker active, no network tab activity at all during that loop.
5. **Write the deployment runbook.** Should be followable by someone who has never seen this codebase: Vercel project creation, connecting the repo, every env var from `global-rules.md`'s registry with where to obtain each value (Convex dashboard, Google AI Studio, Paystack dashboard), Convex production deployment command, configuring the Paystack webhook URL to point at the deployed `/api/webhooks/paystack`, and a short post-deploy smoke test (open the app, complete onboarding, add a product, confirm it syncs to the production Convex dashboard).
6. **Write `PROVIDER_SWITCHING.md`** per `ARCHITECTURE.md` §8 — concise, since the mechanism is intentionally simple: set `AI_PROVIDER=selfhosted` and `SELFHOSTED_AI_URL`, redeploy, done. Note that `providers/selfhosted.ts` is a stub as of this plan (per Phase 6) — be honest that "self-hosting" isn't a fully implemented backend, just an isolated, ready-to-fill extension point, if that's still the state.
7. **Final PRD/ARCHITECTURE reconciliation pass.** If anything built across Phases 1–9 legitimately diverged from the docs in a way not already captured by an ADR (check every phase's "Deviations from Requirements" section), add a final ADR or doc correction now so the committed docs match the shipped system.

## 5. Edge Cases & Required Handling

| Edge case | Required handling |
|---|---|
| A `Known Debt` item from an earlier phase turns out, on inspection, to actually be a bug rather than an accepted tradeoff | Fix it in this phase (it's a bug, not debt) and note the reclassification in this phase's own notes — don't leave a mislabeled item unresolved. |
| The full-journey E2E test is flaky (timing-sensitive polling steps from Phase 5/8) | Use Playwright's built-in retry/wait mechanisms (`expect(...).toPass()`, proper `waitFor` on visible state, not arbitrary `page.waitForTimeout`) rather than papering over flakiness with longer sleeps. |
| Security audit finds a real, fixable issue beyond the pre-accepted ADR-2 debt (e.g. a Convex function actually missing its `shopId` filter) | Fix it — this phase has full authority and obligation to patch such findings, not just report them. |

## 6. Required Tests

- `e2e/full-shopkeeper-journey.spec.ts`: the comprehensive journey described in §4 step 2, as one spec (or a short serial suite) — every major PRD §4 "In scope (MVP)" capability touched at least once.
- No new unit-test *requirements* are introduced by this phase beyond what auditing turns up — if the security or performance pass finds an untested gap in earlier phases' code, add the missing test at the appropriate lowest layer (per global-rules §8) rather than skipping it because "that phase already closed."

## 7. Phase Rules

- This phase does not add new user-facing features. Anything that looks like a missing feature (not a bug, not a polish gap) gets recorded as a final open item for the user in this phase's summary — it does not get silently built here.
- The security audit and performance notes must be genuinely measured/verified, not asserted from confidence — if something can't be verified in the current environment (e.g. no real phone for a live STK push), say so explicitly rather than claiming it was checked.

## 8. Definition of Done

1. `e2e/full-shopkeeper-journey.spec.ts` passes reliably (run it at least twice to confirm it's not flaky).
2. `docs/SECURITY_AUDIT.md`, `docs/PERFORMANCE_NOTES.md`, `docs/DEPLOYMENT.md`, `PROVIDER_SWITCHING.md` all exist and are accurate as of the actual shipped code (not aspirational).
3. `npm run lint` and `npm run build` clean across the whole project; every test suite from every phase still passes (run the full suite, not just this phase's additions).
4. `overview.md` completed, including a final consolidated list of every accepted debt item across the whole project and every open item that requires human judgment before a live demo (the Swahili review list from Phase 9 chief among them).
