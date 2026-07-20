# Phase 9 — Localization & PWA Polish: real Swahili copy, install prompt, offline UX

> Audience: implementing AI agent. Read [`plan/global-rules.md`](../global-rules.md) and Phase 8's `overview.md` first. Follow the steps in order.

## 1. Objective

When this phase is done: every static UI string across the app (onboarding, lock screen, products, sales, checkout, stock-update, summary) exists in both `messages/en.json` and a genuinely reviewed `messages/sw.json` (not machine-translated placeholder text, per `PRD.md` §9's explicit risk mitigation); the app is installable with a real manifest/icon set; offline UX is polished (clear "you're offline" indicators where relevant, no dead-end broken states); and the locale toggle is reachable and working end-to-end.

## 2. Read First

- `PRD.md` §6 (Localization, Installability rows) and §9 ("Rushed/awkward Swahili translations... have a native speaker review copy before final build, not machine-translate")
- `ARCHITECTURE.md` §9 ADR-6 (locale strategy)
- Every prior phase's `overview.md` — specifically, grep each phase's components/pages for hardcoded strings that were never routed through `next-intl` message keys (this phase's job is partly a cleanup pass, not only adding new keys)

## 3. Deliverables

| Path | Purpose |
|---|---|
| `messages/en.json` | Complete, covering every screen built in Phases 1–8 |
| `messages/sw.json` | Complete Swahili translation, reviewed for quality (see step 2 below — this is a process requirement, not just a file) |
| `src/components/LocaleToggle.tsx` | Visible EN/SW switch, sets the locale cookie per ADR-6, reachable from the main shell |
| `src/app/manifest.ts` (revisited from Phase 1) | Final icon set (proper sizes: at least 192×192 and 512×512, plus a maskable icon if time allows), finalized name/theme color |
| `src/components/OfflineIndicator.tsx` | A small, persistent "offline" badge/banner shown app-wide when `navigator.onLine` is false, so a shopkeeper always knows their connectivity state (ties into Phase 5's sync-status UI rather than duplicating it — extend, don't fork) |
| Any component files touched during the string audit | Replace hardcoded strings with `useTranslations`/message keys |

## 4. Implementation Steps (in order)

1. **Audit every screen built so far for hardcoded, untranslated strings.** Go phase by phase (products, sell, checkout, stock-update, summary, onboarding, lock) and extract every user-facing string into `messages/en.json` under a sensible per-screen namespace (e.g. `products.emptyState`, `sell.confirmButton`).
2. **Write the complete `en.json` first**, since it's the source every Swahili string translates from.
3. **Produce the Swahili translations.** Since there's no literal "native speaker in the room" for an automated agent to consult, follow PRD §9's spirit as closely as possible: use careful, idiomatic Swahili appropriate for a Nairobi small-shop context (not formal/literary Swahili, not a raw machine-translation pass with no review) — write each string deliberately, and flag in `overview.md` any string you're genuinely unsure of so a human reviewer can prioritize checking those specifically before the real demo. This is an explicit, acknowledged limitation of an AI-only implementation pass — document it honestly rather than claiming full native-speaker-equivalent confidence.
4. **Build `LocaleToggle.tsx`** and place it somewhere reachable from every screen (the shell layout, not buried in a settings page that doesn't exist in this MVP's scope) — switching should feel instant (client-side cookie set + re-render, no full page reload required if next-intl's client provider supports it without one; if a reload is required, keep it fast and document why).
5. **Finalize the manifest and icons.** Placeholder icons from Phase 1 get replaced with real (even simple) DukaPOS branding — this doesn't need to be a design project, just correct sizes and a recognizable mark, since PRD's judging criteria include "Presentation" but not visual design depth.
6. **Build `OfflineIndicator.tsx`**, reusing Phase 5's online/offline detection rather than re-implementing it — check Phase 5's `overview.md` for the exact hook/utility it exposed.
7. **Sweep for offline dead-ends.** Click through every screen with DevTools set to Offline: confirm nothing shows a raw browser error, an infinite spinner, or a blank screen — every AI-dependent or network-dependent action (photo ID, stock parsing, summary generation, M-Pesa checkout) should degrade gracefully per each phase's own edge-case handling; this step is verification that those individual phases' offline handling actually holds up end-to-end together, not new logic.
8. **Verify:** toggle to Swahili, click through every major screen, confirm no leftover English strings appear (except intentionally-untranslated AI output, per ADR-6); install the PWA (browser's install prompt), confirm it launches standalone with the right icon/name.

## 5. Edge Cases & Required Handling

| Edge case | Required handling |
|---|---|
| A message key referenced in a component but missing from `sw.json` | `next-intl` will typically throw or show a fallback in dev — treat any such occurrence found during the audit as a bug to fix (add the missing key), not something to suppress. Test coverage: a test asserting `en.json` and `sw.json` have exactly the same set of keys (structural parity), so this class of bug can't silently regress later. |
| Locale toggle used while offline | Works with zero network dependency (it's a local cookie + already-cached message catalogs, per Serwist's app-shell caching from Phase 1) — test it with DevTools offline. |
| Offline indicator flapping on an unstable connection (rapid online/offline events) | Debounce the indicator's visibility change slightly so it doesn't flicker distractingly — document the debounce duration chosen. |
| AI-generated text (photo guesses, parsed stock updates, summaries) appearing while the UI locale is Swahili | Per ADR-6/§6 of global-rules, this text is generated per-request in whichever language is appropriate (Phase 7 already targets the summary's language) — confirm this still holds when toggled to Swahili mid-session, i.e. a summary generated after switching to Swahili is requested in Swahili, not stale-cached in English. Test it if feasible at the integration level; otherwise verify manually and record the result. |

## 6. Required Tests

- `messages/parity.test.ts` (a small Vitest test, not tied to a component): `Object.keys` of the flattened `en.json` structure exactly matches the flattened `sw.json` structure (same key set) — catches missing-translation regressions structurally rather than requiring a human to notice a blank string.
- `src/components/LocaleToggle.test.tsx`: clicking the toggle changes the rendered locale's content (assert a known string switches from its English to Swahili form) without a full page navigation (or, if a reload is genuinely required, assert the reload path is exercised and document why in `overview.md` rather than treating this as silently acceptable).
- `src/components/OfflineIndicator.test.tsx`: renders visibly when the underlying online-state source reports offline; renders nothing (or a "synced"/online state) when it reports online.
- `e2e/localization-and-offline.spec.ts` (Playwright): toggle to Swahili, navigate through at least three major screens (e.g. products, sell, stock-update), assert Swahili text is visible on each (spot-check a couple of known strings per screen, not exhaustive); separately, with the app offline, navigate through the same screens and confirm none of them show a raw error state.

## 7. Phase Rules

- Do not introduce any new feature/screen in this phase — it's translation, polish, and cleanup of what Phases 1–8 already built. If a gap reveals a missing feature (not just a missing translation), record it as a note for Phase 10's audit rather than building it here.
- Do not machine-translate-and-ship without at least the deliberate, careful pass described in step 3 — and be explicit in `overview.md` about the limitation of an AI-only translation pass, so a human knows to prioritize a real review before any live demo, per PRD §9.
- Icon/manifest work stays lightweight — this is not a branding phase.

## 8. Definition of Done

1. A human can toggle between English and Swahili anywhere in the app and see every static UI string change accordingly, with no missing/fallback strings; the app installs as a standalone PWA with correct branding; and clicking through the whole app while offline produces no dead-end or raw-error screens.
2. All §6 tests green; `npm run lint` and `npm run build` clean.
3. `overview.md` completed, including: an explicit list of any Swahili strings the implementing agent was genuinely unsure of (for a human reviewer to prioritize) and the debounce duration chosen for the offline indicator.
