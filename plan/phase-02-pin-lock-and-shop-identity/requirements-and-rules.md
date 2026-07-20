# Phase 2 — PIN Lock & Shop Identity: local app lock, shopId, shop profile

> Audience: implementing AI agent. Read [`plan/global-rules.md`](../global-rules.md) and Phase 1's `overview.md` first. Follow the steps in order.
>
> This phase implements ADR-2 exactly: **there is no server-side account system.** If any part of this phase file seems to ask you to build a login API route, session cookie, or password-reset flow, stop — that's not what ADR-2 describes, re-read it.

## 1. Objective

When this phase is done: on first launch, the app asks the shopkeeper to set a 4-digit PIN and enter a shop name + phone number; a `shopId` (UUID) is generated and persisted; on every subsequent launch, the app shows a PIN-entry screen and only reveals the rest of the app once the correct PIN is entered; the PIN is never stored or checked anywhere except on-device. This unblocks every later phase's UI, since they all render behind this lock.

## 2. Read First

- `PRD.md` §5 "Account & Access" (including the ADR-2 clarification line added there)
- `ARCHITECTURE.md` §9 ADR-2 (ties directly to this phase) and §7 "PIN stored securely"
- Phase 1 `overview.md` — the final Dexie schema/table names, how to import `db`, where `NextIntlClientProvider`/layout lives

## 3. Deliverables

| Path | Purpose |
|---|---|
| `src/lib/db/schema.ts` (modified) | Add a `shopProfile` table (single row: `shopId`, `shopName`, `phoneE164`, `pinHash`, `pinSalt`, `createdAt`) |
| `src/lib/identity/shopIdentity.ts` | Pure functions: `createShopProfile(input)`, `getShopProfile()`, `verifyPin(pin)`, `updatePin(newPin)` — hashing/salting logic lives here, nowhere else |
| `src/lib/identity/normalizePhone.ts` | Pure function: converts `0712345678` / `712345678` / `+254712345678` all to canonical `+254712345678`; throws/returns an error result for anything that isn't a plausible Kenyan mobile number |
| `src/app/[locale]/onboarding/page.tsx` | First-launch flow: shop name, phone, set PIN (with confirm-PIN step) |
| `src/app/[locale]/lock/page.tsx` | PIN-entry screen shown whenever the app is locked |
| `src/components/PinPad.tsx` | Reusable numeric PIN input component (used by both onboarding and lock screens) |
| `src/lib/identity/lockState.ts` or a small context/hook | In-memory "is the app currently unlocked this session" state — does not persist across a full app close (re-entering the PIN is required each fresh launch, consistent with "app lock" semantics) |
| Root layout/middleware change | Routes render the lock screen instead of their content when locked, and the onboarding flow instead of the lock screen when no shop profile exists yet |

## 4. Implementation Steps (in order)

1. **Extend the Dexie schema.** Add a `version(2)` migration (do not silently mutate `version(1)` — Dexie versioning is how schema changes are tracked) adding the `shopProfile` table, indexed on `shopId`. Confirm this migrates cleanly from a Phase-1-only database (write a test for it — see §6).
2. **Write `normalizePhone.ts` first, docstring-first.** Contract: accepts a string, returns `{ ok: true, value: '+254...' }` or `{ ok: false, reason: string }`. Handles the three input shapes named in §3. This is the kind of pure function global-rules §2 mandates — no framework imports.
3. **Write `shopIdentity.ts`.** PIN hashing: use the Web Crypto API's `crypto.subtle.digest` with a random per-shop salt (`crypto.getRandomValues`), not a plaintext comparison and not a third-party bcrypt-in-the-browser library (unnecessary dependency weight for a 4-digit PIN whose threat model is "don't store it in cleartext," not "resist targeted offline cracking" — this is a deliberate scope call, not an oversight; note it in `overview.md`). `createShopProfile({shopName, phone, pin})` normalizes the phone via `normalizePhone`, generates `shopId = crypto.randomUUID()`, hashes the PIN, and writes one row to `shopProfile`. `verifyPin(pin)` re-hashes with the stored salt and compares. `getShopProfile()` returns the row or `undefined` if onboarding hasn't happened.
4. **Build `PinPad.tsx`** as a controlled component: renders 0–9 + backspace, calls `onComplete(pin)` once 4 digits are entered. No business logic inside it — it's purely an input widget.
5. **Build the onboarding page.** Three-step local state machine (shop name + phone → set PIN → confirm PIN) inside one page component — per global-rules §2's "no temporal decomposition," this is one component managing local step state, not three separate routes coordinating shared data. On confirm-PIN match, calls `createShopProfile` and transitions into the unlocked app (e.g. redirect to `/`).
6. **Build the lock screen and gating logic.** On app load: if `getShopProfile()` is `undefined` → show onboarding. Else if session is locked → show `PinPad` wired to `verifyPin`; on success, mark session unlocked (in-memory) and render children. This gating lives in the root `[locale]/layout.tsx` (or a client component it renders) so every route is covered without each page re-implementing the check.
7. **Handle wrong PIN.** No lockout/rate-limiting in this MVP (single local device, low-stakes threat model per §3 step 3's note) — just visible "incorrect PIN" feedback and a cleared input. Document this scope call in `overview.md`.
8. **Verify:** fresh browser profile → onboarding appears → complete it → app unlocks → reload page → lock screen appears (not onboarding) → correct PIN unlocks → wrong PIN stays locked.

## 5. Edge Cases & Required Handling

| Edge case | Required handling |
|---|---|
| Phone number with spaces or dashes (`0712 345 678`) | `normalizePhone` strips non-digit characters before validating/converting. Test it. |
| Phone number that's the wrong length or not a Kenyan mobile prefix | `normalizePhone` returns `{ ok: false, reason }`; onboarding shows an inline error and does not call `createShopProfile`. Test it. |
| PIN and confirm-PIN mismatch during onboarding | Onboarding shows an error and returns the user to the "set PIN" step without writing anything to Dexie. Test it. |
| `verifyPin` called before any shop profile exists | Returns `false` (or a typed "no profile" result) rather than throwing — the calling UI shouldn't be reachable in this state anyway, but the function must be safe. Test it. |
| Same PIN entered as both digits, e.g. `1111` | Allowed — no PIN-strength policy in this MVP. Explicitly do not add one; it's out of scope. |
| Dexie migration from a Phase-1-only (`version(1)`) database to `version(2)` | Existing `products`/`transactions`/`syncQueue` data survives untouched; `shopProfile` table is simply new and empty. Test it by seeding a v1-shaped fake DB state and asserting the migrated DB still has the old rows. |

## 6. Required Tests

- `src/lib/identity/normalizePhone.test.ts`: `0712345678` → `+254712345678`; `712345678` → `+254712345678`; `+254712345678` → `+254712345678` (idempotent); `0712 345 678` (with spaces) → `+254712345678`; `12345` → `{ ok: false }`; empty string → `{ ok: false }`.
- `src/lib/identity/shopIdentity.test.ts`: `createShopProfile({shopName: "Mama Njeri's Shop", phone: "0712345678", pin: "1234"})` then `getShopProfile()` returns a row with the normalized phone and a `shopId` that's a valid UUID string; `verifyPin("1234")` returns `true` after that setup; `verifyPin("0000")` returns `false` after that setup; `verifyPin` with no profile created returns `false` without throwing; the stored `pinHash` is not equal to the literal string `"1234"` (proves it's actually hashed, not stored plaintext).
- `src/lib/db/schema.test.ts` (extended): a database seeded with only `version(1)` data, then opened against the `version(2)` schema, still contains the original `products` rows.
- `src/app/[locale]/onboarding/page.test.tsx` (Testing Library, `user-event`): filling shop name + valid phone, setting PIN `1234`, confirming with `1234` results in a call that persists the profile (assert via a following `getShopProfile()` or a mocked `createShopProfile`); confirming with a mismatched PIN (`4321`) shows an error and does not persist.
- `e2e/pin-lock.spec.ts` (Playwright): fresh browser context → app shows onboarding → complete it with concrete values → app shows unlocked content → reload → app shows the lock screen (not onboarding) → enter the wrong PIN → still locked, error visible → enter the correct PIN → unlocked content visible.

## 7. Phase Rules

- No product/sales UI beyond whatever placeholder the unlocked shell already showed in Phase 1 — this phase is only the lock and identity layer.
- Do not add any network call, session cookie, or server route for authentication. If you think you need one, you've misread ADR-2 — re-read it.
- Do not add PIN-attempt rate limiting, lockout timers, or biometric unlock — explicitly out of scope for this MVP (note as a possible future enhancement in `overview.md`, not as debt, since it was never required).
- `shopId` is generated exactly once, in `createShopProfile`. No other code path generates a `shopId`.

## 8. Definition of Done

1. A human can: open the app fresh, complete onboarding with a shop name/phone/PIN, see the app unlock, reload the page, see the lock screen, and unlock again with the same PIN.
2. All §6 tests green; `npm run lint` and `npm run build` clean.
3. `overview.md` completed, including: the exact PIN hashing primitive used (algorithm, salt length) and why it's judged sufficient for this threat model; the final `ShopProfile` type shape, pasted verbatim, for later phases (Phase 5's Convex schema and Phase 8's checkout flow both reference `shopId`).
