# Phase 2 — Overview (completed by the implementing agent)

> Fill this in **after** the phase's Definition of Done is met. Be exhaustive — the next phase's agent starts by reading this file and has no memory of your session. Every section is mandatory; write "None" explicitly rather than leaving a section blank.

## Status

- [ ] All deliverables built
- [ ] All required tests green
- [ ] Lint + typecheck clean
- Completed on: `____-__-__`

## What Was Built

_Every file created or modified, one line each: path — purpose — anything non-obvious about it._

## Design Decisions & Rationale

_Pre-seeded items to cover:_
- _(a) PIN hashing primitive used (algorithm, salt length/generation) and the threat-model reasoning for why it's sufficient._
- _(b) The final `ShopProfile` TypeScript type — paste it verbatim; Phase 5 (Convex schema) and Phase 8 (checkout) both need `shopId`'s exact type._
- _(c) Where session "unlocked" state lives (memory/context/module state) and its exact reset behavior (confirm it resets on full app reload, not just route change)._

## Deviations from Requirements

_"None" if fully compliant._

## Issues Encountered & How They Were Fixed

## Tests Written

_Each test file, each test, what it proves — one line per test._

## How to Run Automated Tests

```bash
# exact commands and any prerequisites
```

## How to Manually Verify This Phase

1. Open the app in a fresh/incognito browser context. Confirm onboarding appears (not the lock screen, not the app shell).
2. Complete onboarding with a real-looking shop name, phone, and PIN. Confirm the app unlocks.
3. Reload the page. Confirm the lock screen appears (not onboarding, not straight into the app).
4. Enter an incorrect PIN. Confirm it's rejected with visible feedback and the app stays locked.
5. Enter the correct PIN. Confirm the app unlocks.
6. Open DevTools → Application → IndexedDB, inspect the `shopProfile` table. Confirm the PIN field is a hash, not `"1234"` in cleartext. Describe what you saw: ____

## Known Debt

_"None" if none — note the explicitly-out-of-scope items (rate limiting, PIN strength policy) here as "scope decisions," not debt, since they were never required._

## Handoff Notes for Phase 3

_The exact `ShopProfile` shape and the `getShopProfile()`/`verifyPin()` function signatures Phase 3+ can rely on. Whether the lock gating lives in a layout or a wrapper component, so later phases know where "already unlocked" is assumed._
