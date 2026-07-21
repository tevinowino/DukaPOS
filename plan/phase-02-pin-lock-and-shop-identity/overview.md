# Phase 2 — Overview (completed by the implementing agent)

## Status

- [x] All deliverables built
- [x] All required tests green
- [x] Lint + typecheck clean
- Completed on: `2026-07-21`

## What Was Built

- `src/lib/db/schema.ts` (modified) — added `ShopProfile` interface and a `version(2).stores({shopProfile: "shopId"})` migration block (did not touch `version(1)`).
- `src/lib/identity/normalizePhone.ts` — pure function, canonical E.164 output.
- `src/lib/identity/shopIdentity.ts` — `createShopProfile`, `getShopProfile`, `verifyPin`, `updatePin` (SHA-256 + random salt via Web Crypto).
- `src/components/PinPad.tsx` — presentational numeric keypad; self-clears its entered digits after every 4-digit attempt regardless of outcome (see Deviations — this made an originally-planned external "clear" mechanism unnecessary).
- `src/components/OnboardingScreen.tsx` — three-step local state machine (details → set PIN → confirm PIN); calls `createShopProfile` exactly once.
- `src/components/LockScreen.tsx` — PIN entry wired to `verifyPin`.
- `src/components/AppLockGate.tsx` — the actual enforcement mechanism, embedded in the root layout; renders onboarding/lock/children based on `getShopProfile()` + in-memory unlock state (see Design Decisions for why routes don't do this).
- `src/app/[locale]/onboarding/page.tsx`, `src/app/[locale]/lock/page.tsx` — redirect-to-`/` stubs, not independent renderers (see Deviations).
- `src/app/[locale]/layout.tsx` (modified) — wraps `{children}` in `<AppLockGate>` inside `NextIntlClientProvider`.
- `messages/en.json`, `messages/sw.json` (extended) — added `onboarding` and `lock` namespaces.
- `src/lib/db/schema.test.ts` (extended) — version(2) migration test.
- `src/lib/identity/normalizePhone.test.ts`, `src/lib/identity/shopIdentity.test.ts`, `src/components/OnboardingScreen.test.tsx` — new test files.
- `vitest.setup.ts` (modified) — registers Testing Library's `cleanup()` in an `afterEach` (see Issues Encountered — this was a real, previously-latent bug affecting Phase 1's tests too).
- `e2e/pin-lock.spec.ts` — new full onboarding→reload→lock→unlock journey.
- `e2e/app-shell.spec.ts` (modified) — now asserts on `<title>` instead of visible body text, and tightens the service-worker wait to the `activated` state specifically (see Deviations).

## Design Decisions & Rationale

**(a) PIN hashing primitive:** `crypto.subtle.digest("SHA-256", ...)` over `${salt}:${pin}`, with `salt = crypto.randomUUID()` generated per shop. Not bcrypt/scrypt/Argon2 — deliberate: the threat model here is "don't store a 4-digit PIN in cleartext on one local device," not "resist a targeted offline brute-force of a 4-digit keyspace" (which no PIN-length-appropriate hash function meaningfully defends against anyway — a 4-digit PIN is only ever as strong as the fact that it's not visible in the IndexedDB inspector or a casual dump of the database file). Adding a slow KDF would be security theater at this PIN length and an unnecessary dependency for a hackathon timeline.

**(b) Final `ShopProfile` type** (`src/lib/db/schema.ts`, verbatim):
```ts
export interface ShopProfile {
  shopId: string;
  shopName: string;
  phoneE164: string;   // canonical, e.g. "+254712345678"
  pinHash: string;
  pinSalt: string;
  createdAt: number;    // epoch ms
}
```

**(c) Where "unlocked" session state lives:** a plain `useState<GateStatus>` inside `AppLockGate` (`"loading" | "needsOnboarding" | "locked" | "unlocked"`), re-derived from `getShopProfile()` on every fresh mount of `AppLockGate` — i.e. every full page load/reload. Confirmed via the e2e test: after unlocking, a `page.reload()` returns to the lock screen (not silently staying unlocked), which is the correct app-lock semantics per ADR-2. This state is intentionally *not* persisted anywhere (not `sessionStorage`, not a cookie) — "unlocked" only ever means "unlocked since the last full load," which is what makes it an app lock rather than a session with its own expiry logic to get wrong.

**Gating architecture (not explicitly pre-seeded, but a load-bearing decision):** `AppLockGate` renders the onboarding/lock UI directly and in-place, rather than using `router.replace()` redirects to the `/onboarding` and `/lock` routes. This was a deliberate choice over the more "route-based" design the phase file's deliverables table suggested (`/onboarding` and `/lock` as pages): a single client component checking state once and swapping rendered content is simpler, avoids a redirect flash/loop, and — critically — avoids a real bug the route-based design would have had: if `/onboarding` independently rendered `<OnboardingScreen>` regardless of gate state, navigating there while already unlocked (e.g. a stale bookmark) could create a **second** `shopProfile` row, corrupting the single-row assumption `getShopProfile()`'s `.toCollection().first()` relies on. To keep the deliverable paths existing (as the phase file requires) without that risk, `/onboarding` and `/lock` are now thin `router.replace("/")` redirect stubs — `AppLockGate` is the sole enforcement/rendering point regardless of which URL was requested. Documented as a Deviation below since it changes what those two files actually do.

## Deviations from Requirements

1. **`/onboarding` and `/lock` are redirect stubs, not independent screens.** See the gating architecture rationale above. The phase file's deliverables table described them as rendering `OnboardingScreen`/`LockScreen` directly; instead they redirect to `/`, where `AppLockGate` (embedded in the layout) renders the correct screen for the current state regardless of the originally-requested path. Functionally equivalent from a user's perspective (same screens appear), but avoids a duplicate-profile-creation edge case the route-rendering approach didn't guard against.

2. **`PinPad`'s `clearSignal` prop was removed entirely (not part of the final interface).** Originally implemented per plan with a `clearSignal: number` prop + `useEffect` that called `setDigits("")` on change — this tripped ESLint's `react-hooks/set-state-in-effect` rule (`Calling setState synchronously within an effect can trigger cascading renders`), a genuine anti-pattern flag, not a false positive. On inspection, it turned out to be unnecessary in the first place: `PinPad.pressDigit` already calls `setDigits("")` immediately after firing `onComplete`, on every 4-digit attempt, regardless of whether the caller's `onComplete` handler considered it correct — so the digit buffer was already empty by the time any caller could react to a wrong PIN. Removed the prop and the `attempt`/`clearSignal` state entirely from both `LockScreen` and `OnboardingScreen`; no `key`-remount trick was even needed. Net effect: simpler code than what the phase file specified, doing the same thing.

3. **`e2e/app-shell.spec.ts` no longer asserts visible `"DukaPOS"` body text.** Phase 1 wrote that assertion when there was no PIN lock; now a fresh browser context shows onboarding at `/`, not the shell. Switched to asserting `<title>DukaPOS</title>` (server-rendered metadata, unaffected by which client-side gate state is showing) as the "shell loaded" signal instead. Also tightened the service-worker wait from "registration.active !== null" to "registration.active?.state === 'activated'" specifically — the looser check was intermittently observing the `"activating"` state and then racing the follow-up assertion, causing a flaky failure caught while re-running the full e2e suite for this phase.

## Issues Encountered & How They Were Fixed

- **Testing Library wasn't cleaning up the DOM between tests within the same file**, causing a `getMultipleElementsFoundError` the first time a test file had more than one test rendering the same component tree (`OnboardingScreen.test.tsx`'s second test found two sets of PinPad digit buttons — the first test's unclean tree plus the second's). Root cause: `vitest.config.ts` doesn't set `test.globals: true`, so Testing Library's own auto-registered `afterEach(cleanup)` (which detects a global `afterEach`) never installed. Fixed by explicitly importing `cleanup` from `@testing-library/react` and calling it in an `afterEach` inside `vitest.setup.ts`. **This was a latent bug since Phase 1** — it just never surfaced there because `ShellHome.test.tsx` only had one test in the file. Flagging clearly: any future phase adding a second test to `ShellHome.test.tsx` (or any other single-test file) would have hit this eventually; it's fixed globally now.
- **ESLint's `react-hooks/set-state-in-effect`** caught the `clearSignal` pattern described in Deviation #2 above — resolved by removing the unnecessary reset mechanism rather than suppressing the lint rule.
- **Playwright's own route-announcer element also has `role="alert"`** (`#__next-route-announcer__`), which made `page.getByRole("alert")` ambiguous in `e2e/pin-lock.spec.ts`. Switched to `page.getByText(/incorrect pin/i)` to scope to the actual error message.

## Tests Written

- `src/lib/identity/normalizePhone.test.ts`: `0712345678` → `+254712345678`; `712345678` → `+254712345678`; `+254712345678` → itself (idempotent); `0712 345 678` (spaces) → `+254712345678`; `12345` → `ok: false`; `""` → `ok: false`.
- `src/lib/identity/shopIdentity.test.ts`: `createShopProfile` persists a profile with normalized phone and a valid-shaped UUID `shopId`; the stored `pinHash` is not the literal PIN string; `verifyPin` returns `true` for the correct PIN and `false` for a wrong one after setup; `verifyPin` returns `false` (not a throw) with no profile; an invalid phone is rejected and persists nothing.
- `src/lib/db/schema.test.ts` (extended): a database seeded with only `version(1)`-shaped data, then reopened against `version(1)+version(2)`, still contains the original product row, and the new `shopProfile` table is present and empty.
- `src/components/OnboardingScreen.test.tsx`: full details→PIN→confirm flow with matching PINs persists the profile with the correct fields and calls `onComplete`; a mismatched confirm PIN shows the mismatch error and persists nothing; an invalid phone number blocks advancing past the details step with a visible error.
- `e2e/pin-lock.spec.ts`: fresh context shows onboarding → complete it with concrete values → app content visible, onboarding gone → reload → lock screen (not onboarding) → wrong PIN rejected with visible error → correct PIN unlocks.

## How to Run Automated Tests

```bash
npm run test:unit   # Vitest
npm run test:e2e    # Playwright — runs `npm run dev` (webpack) itself via webServer
```

## How to Manually Verify This Phase

1. Open the app in a fresh/incognito browser context. Confirmed: onboarding appears (not the lock screen, not the app shell).
2. Completed onboarding with `"Mama Njeri's Shop"` / `0712345678` / PIN `1234`. Confirmed: app unlocks immediately, shell content ("DukaPOS") visible.
3. Reloaded the page. Confirmed: lock screen appears (not onboarding, not straight into the app).
4. Entered PIN `0000`. Confirmed: rejected with visible "Incorrect PIN — try again", app stays locked.
5. Entered PIN `1234`. Confirmed: app unlocks.
6. DevTools → Application → IndexedDB → `DukaDB` → `shopProfile`: confirmed `pinHash` is a 64-character hex string (SHA-256 digest), not `"1234"` in cleartext; confirmed `phoneE164` reads `"+254712345678"`, not the raw `"0712345678"` that was typed.

## Known Debt

None beyond what Phase 1 already recorded (Swahili strings pending native review — the two new `onboarding`/`lock` namespaces added this phase carry the same caveat; see Handoff Notes).

## Handoff Notes for Phase 3

- Import `getShopProfile`/`verifyPin`/`createShopProfile`/`updatePin` from `@/lib/identity/shopIdentity` if ever needed; Phase 3 (product management) shouldn't need any of them directly — products aren't `shopId`-scoped locally (single value lives in `shopProfile`, per ADR-2), so Phase 3's Dexie work is unaffected by this phase.
- **Everything Phase 3 builds automatically renders behind the PIN lock** — `AppLockGate` wraps `{children}` in the root layout, so any new route under `[locale]/` is gated for free. No action needed, just don't be surprised that a fresh e2e test for a Phase 3 screen needs to complete onboarding first (see `e2e/pin-lock.spec.ts` for the pattern: fill shop name/phone, `Continue`, then two 4-digit `PinPad` entries).
- The two new Swahili namespaces (`onboarding`, `lock`) carry the same not-yet-natively-reviewed caveat as Phase 1's `shell` namespace — Phase 9 owns reviewing all of them together, not just Phase 1's.
- `vitest.setup.ts` now registers global test cleanup — any new component test file with 2+ tests will behave correctly without needing to know about this.
- The `SyncQueue`/`syncedAt` question from Phase 1's handoff note is still open — Phase 3 (per its own phase file) may optionally start enqueueing on product writes; this phase didn't touch that decision either way, since `shopProfile` writes aren't part of any planned sync scope (the shop's own identity never needs to sync anywhere — it's what *scopes* sync, not something that gets synced itself).
