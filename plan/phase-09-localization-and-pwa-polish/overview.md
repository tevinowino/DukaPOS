# Phase 9 — Overview (completed by the implementing agent)

## Status

- [x] All deliverables built
- [x] All required tests green
- [x] Lint + typecheck clean
- Completed on: `2026-07-22`

## What Was Built

- `src/components/AppIntlProvider.tsx` (new) — owns the active locale entirely client-side (both message catalogs statically imported, switching is a plain `useState` update). Replaces the previous server-only `NextIntlClientProvider`/`getMessages()` wiring in the root layout. See Design Decisions (c) for why it deliberately does *not* call `router.refresh()`.
- `src/components/LocaleToggle.tsx` (new) — EN/SW toggle, renders unconditionally above every `AppLockGate` state (already wired into `AppLockGate.tsx` before this session's context was summarized, per its own doc comment: a Swahili-only-literate shopkeeper needs to reach a readable language before onboarding/PIN, not only after).
- `src/components/OfflineIndicator.tsx` (already existed from earlier in this session) — small persistent "offline" badge, reusing Phase 5's `useOnlineSync`. Its debounce (see Design Decisions (b)) only smooths *changes* after mount — it shows immediately if already offline at mount, which is correct (nothing to smooth yet).
- `src/app/[locale]/layout.tsx` — swapped direct `NextIntlClientProvider`/`getMessages()` for `<AppIntlProvider initialLocale={locale}>`.
- `src/app/[locale]/stock-update/page.tsx`, `src/app/[locale]/summary/page.tsx` — added a proactive `isOnline` check (via `useOnlineSync`, same pattern the photo-product page already used) so attempting an AI-dependent action while offline shows an honest "needs a connection" message instead of the generic "couldn't parse/generate" failure message.
- `src/components/PinPad.tsx` — the one real hardcoded-string gap the audit found: `aria-label="Backspace"` and a hardcoded `"{n} of {length} digits entered"` template. Now uses `useTranslations("pinPad")`, matching the pattern every other component in this codebase already follows.
- `src/app/manifest.ts` — real branding (see below) replacing Phase 1's solid-color placeholder; added `purpose: "any"` on the existing two icons and two new `purpose: "maskable"` entries.
- `public/icon-192.png`, `public/icon-512.png` (regenerated), `public/icon-maskable-192.png`, `public/icon-maskable-512.png` (new) — a plain white "D" monogram on the app's existing `#171717` theme color, rendered via `sharp` from an inline SVG (no design tool available; a one-off generation script was used and deleted after — not committed). The maskable pair keeps the glyph inside a ~65%-diameter safe zone with the background filling the full canvas edge-to-edge, since an OS may crop maskable icons to a circle.
- `src/app/sw.ts` — a real caching-reliability bug fix; see Issues Encountered (2), the most substantial finding of this phase.
- `messages/en.json`, `messages/sw.json` — new `localeToggle` and `offlineIndicator` namespaces, new `pinPad` namespace, and `offlineMessage` keys added to `stockUpdate` and `summary`.
- `messages/parity.test.ts`, `src/components/LocaleToggle.test.tsx`, `src/components/OfflineIndicator.test.tsx`, `e2e/localization-and-offline.spec.ts` — see Tests Written.

## Design Decisions & Rationale

**(a) Swahili strings the agent is genuinely unsure of.** This phase's own audit re-confirmed the bulk of the app's Swahili copy was already written in Phases 1–8, not fresh here — no native speaker has reviewed any of it, in this phase or earlier ones, per PRD §9's acknowledged limitation. The specific strings added *in this phase*, least likely to have had any prior scrutiny, and worth prioritizing in a human review before a real demo:
  - `pinPad.digitsEntered`: `"Tarakimu {entered} kati ya {length} zimewekwa"` — a screen-reader-only string (never visually rendered), so a wrong register here is low-visibility but still worth checking.
  - `pinPad.backspace`: `"Futa nyuma"` (literally "erase backward").
  - `offlineIndicator.offlineBadge`: `"Haiko mtandaoni — mabadiliko yamehifadhiwa kwenye kifaa hiki"` — deliberately different wording from the existing `sync.offline` string (which talks about a future sync), since this badge is meant to answer a blunter "can I trust the network right now" question; worth checking the two don't read as contradictory to a Swahili reader.
  - `stockUpdate.offlineMessage` / `summary.offlineMessage` — both follow the exact sentence pattern of `photoProduct.offlineMessage` (an earlier phase's string), so confidence here is inherited from that string rather than independently high.

**(b) Offline-indicator debounce: 1500ms**, chosen (in the earlier part of this session) as a round number comfortably longer than a typical brief connectivity blip on mobile data, short enough that a genuine disconnect still reads as prompt. Only applies to a status *change* after mount — see `OfflineIndicator.tsx`'s state initialization (`useState(status === "offline")`), which intentionally shows the badge immediately if already offline when the component first mounts, since there's no prior "on" state to protect from flicker in that case.

**(c) The locale toggle is fully client-side, with one real, documented limitation.** `AppIntlProvider.setLocale` updates React state and the `NEXT_LOCALE` cookie only — no `router.refresh()`, no navigation, no network call, satisfying the offline-toggle edge case with zero caveats for the toggle action itself. `router.refresh()` was tried and reverted: `[locale]` is a real dynamic route segment under the hood (ADR-6's "no prefix in the URL" is a rewrite, not the absence of a segment), and calling `refresh()` after the cookie changes causes that segment's server-resolved value to flip — which remounts everything under the root layout, including `AppLockGate`'s in-memory "unlocked" state, and force-relocks the app. Proven live: adding `router.refresh()` made the app relock **immediately on every single toggle click**, every time. Removing it means the same remount+relock can *still* happen, but only later, if/when the very next server round trip (typically the next cross-screen navigation) needs one — strictly better than guaranteeing it up front. This residual behavior is real and not fully eliminated; see Known Debt.

## Deviations from Requirements

None from the phase file's literal deliverables. Two pieces of work went beyond the phase file's explicit list, both in direct service of Definition of Done item 1 ("clicking through the whole app while offline produces no dead-end or raw-error screens"):
1. Proactive offline checks added to `stock-update` and `summary` pages (not explicitly requested, but the same pattern the photo-product page already established, and required to avoid a misleading generic error message when offline).
2. The `src/app/sw.ts` caching fix (Issues Encountered (2)) — not a translation/UI change at all, but the root cause of a real offline dead-end this phase's own required "sweep" step exists to catch.

## Issues Encountered & How They Were Fixed

**(1) Switching locale, then navigating to a different screen, re-locks the app (relocks `AppLockGate`).** Root-caused via the `router.refresh()` experiment in Design Decisions (c): the `[locale]` route segment's resolved value changes when the cookie changes, and the next server round trip after that remounts the client tree under the root layout. This is a genuine, real consequence of ADR-6's architecture (locale hidden from the URL via a rewrite, but still a real dynamic segment underneath), not something fixable by a small patch — see Known Debt. Tests tolerate it the same way `offline-sync.spec.ts` (Phase 5) already tolerates its own reload case: re-enter the PIN if the lock screen reappears, then keep going (`clickLinkTolerateRelock` in `e2e/localization-and-offline.spec.ts`).

**(2) A real offline navigation dead-end, found during the required "sweep" step and fixed.** `e2e/localization-and-offline.spec.ts`'s offline-navigation test intermittently hung indefinitely (not a clean error — a genuine hang, past a 20-second wait) on the *first* offline navigation to a page that had been visited once already while online. Diagnosed by dumping live Cache Storage contents (`caches.open(name).then(c => c.keys())`) after warming up `/products`: the page **was** cached, but under `pages-rsc`, keyed by the exact request URL including a `_rsc=<nonce>` query parameter that Next's client router generates fresh on every navigation and does not keep stable across separate visits to the same route. `@serwist/next`'s `defaultCache` (imported wholesale in `src/app/sw.ts`) matches its RSC/HTML navigation cache entries by exact URL (no `ignoreSearch`) and sets no `networkTimeoutSeconds` on those specific entries — so a fresh offline navigation generates a different `_rsc` value, misses the cached entry entirely, and `NetworkFirst` (correctly) tries the network, which (correctly, since offline) never resolves, and with no timeout configured, the strategy just waits. **Fix:** `src/app/sw.ts` now patches the three navigation-related entries in `defaultCache` (`pages-rsc-prefetch`, `pages-rsc`, `pages`) with `matchOptions: { ignoreSearch: true }`, a standard, documented Workbox/Serwist `Strategy` option — cache lookups for these entries now match on pathname alone. Verified: the exact repro (warm up `/products` online, go offline, click "View stock" again) passed reliably across 6 repeated runs after the fix, having failed consistently before it. This almost certainly also strengthens `offline-sync.spec.ts` (Phase 5)'s existing full-reload fallback path, which depends on the same cache — that test still passes, though it wasn't specifically re-driven through this exact failure mode today.

**(3) `OfflineIndicator.test.tsx`'s debounce test needed `act()` around fake-timer advancement.** The debounce `setTimeout` callback calls `setDebouncedOffline` outside React's normal event/commit cycle; without wrapping `vi.advanceTimersByTimeAsync(...)` in `act()`, the state update fires (confirmed via a temporary `console.log` inside the effect) but never flushes to the DOM before the test's next assertion reads it — the test would see stale output even though the component's logic was correct. This extends this project's existing documented fake-timer pattern (CLAUDE.md's `shouldAdvanceTime`/`runAllTimersAsync` snippet) with the `act()` wrapper needed specifically when the timer callback triggers a state update from outside a user-event-driven flow.

## Tests Written

- `messages/parity.test.ts`: flattens both catalogs' keys (recursively, dot-joined) and asserts the sorted sets are identical — catches a missing-translation regression structurally.
- `src/components/LocaleToggle.test.tsx`: clicking "SW" flips a rendered string (`shell.tagline`, which differs between locales) synchronously, with no navigation involved; clicking also writes the `NEXT_LOCALE` cookie.
- `src/components/OfflineIndicator.test.tsx`: shows the badge immediately when already offline at mount; renders nothing when online at mount; a mid-session online→offline transition is debounced (not visible before 1500ms, visible after).
- `e2e/localization-and-offline.spec.ts`:
  - Toggles to Swahili, navigates products → sell → stock-update (tolerating the known relock from Issue (1)), confirms Swahili text on each; then, fully offline, toggles EN→SW→EN using only client-side state, confirming zero network dependency.
  - Warms up products/sell/stock-update while online, goes offline, re-navigates the same three screens confirming no `/application error/i` text anywhere, and confirms the stock-update page's own offline-aware message appears when attempting the AI parse action while offline.

## How to Run Automated Tests

```bash
npm run test:unit   # includes messages/parity.test.ts, LocaleToggle.test.tsx, OfflineIndicator.test.tsx
npm run test:e2e    # includes e2e/localization-and-offline.spec.ts (needs public/sw.js removed first if stale — see repo's established pattern; run twice if flaky, per this project's existing E2E notes)
```

## How to Manually Verify This Phase

1. Toggle to Swahili from the shell (visible above the onboarding/lock screen too). Confirm the change applies instantly, no visible reload.
2. Click through products, sell, stock-update, and summary screens in Swahili — confirm no leftover English strings appear (aside from AI-generated content, which is intentionally generated in whichever language is active, per Phase 7). If the PIN screen reappears once after the first navigation post-toggle, that's the known, documented behavior in Issue (1) — re-enter the PIN and continue.
3. DevTools → Application → Manifest: confirm name "DukaPOS", theme color `#171717`, and four icons (192/512 × any/maskable) all resolve correctly. Trigger the browser's install prompt if available and confirm standalone launch.
4. Visit products, sell, and stock-update once while online, then go offline (DevTools → Network → Offline) and click through the same three screens again — confirm no raw error screen and no indefinite hang (should resolve within a couple of seconds, per Issue (2)'s fix).
5. Confirm the offline indicator badge appears when offline and clears (after a moment) once back online.

## Known Debt

**DEBT(prudent-deliberate):** Switching locale, then navigating to a screen the router doesn't already have cached under the new locale, can still trigger one PIN re-entry (Issue (1)). Not eliminated because doing so properly would mean either accepting the *worse* immediate-relock-on-every-toggle behavior (the `router.refresh()` alternative that was tried and reverted) or a deeper architectural change to how `AppLockGate`'s unlock state survives a root-layout remount (e.g., persisting "unlocked" in `sessionStorage` instead of `useState`, so a remount can restore it) — a legitimate direction, but a bigger, riskier change than this phase's translation/polish/cleanup scope invited, and not something to build without deliberately testing it holds up against `AppLockGate`'s own "unlocked resets on a full reload" intended design (a `sessionStorage`-backed unlock would need to distinguish "in-app remount" from "user closed the tab," which the current `useState` approach doesn't need to). Remediation path: reconsider `AppLockGate`'s unlock persistence mechanism if this proves annoying in real use.

## Handoff Notes for Phase 10

- The Swahili strings listed in Design Decisions (a) — and, more broadly, the *entire* Swahili catalog, not just this phase's additions — have never been reviewed by a native speaker. Phase 10's hardening report should carry this forward as an open item for the user before any real demo, per PRD §9.
- The relock-on-locale-switch-then-navigate behavior (Known Debt) is safe (never a dead end, never data loss) but is a real, user-visible rough edge worth a mention in Phase 10's report even though it's out of this phase's scope to fully resolve.
- `NEXT_PUBLIC_CONVEX_URL` is still unset (carried forward from Phase 5/8) — unrelated to this phase's work, but still the standing gap for any live end-to-end verification.
