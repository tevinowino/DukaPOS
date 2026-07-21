# Phase 1 — Overview (completed by the implementing agent)

## Status

- [x] All deliverables built
- [x] All required tests green
- [x] Lint + typecheck clean
- Completed on: `2026-07-21`

## What Was Built

- `vitest.config.ts`, `vitest.setup.ts` — jsdom environment, `@/*` alias, `fake-indexeddb/auto` + jest-dom matchers installed globally.
- `playwright.config.ts` — single Chromium project, `webServer` runs `npm run dev` (see Deviations for why this now matters more than it looks).
- `package.json` — added `test:unit`, `test:unit:watch`, `test:e2e` scripts; **`dev`/`build` now pass `--webpack`** (see Deviations).
- `src/lib/db/schema.ts` — `Product`, `Transaction`, `SyncQueueEntry` types + `DukaDB` (Dexie) singleton `db`.
- `src/lib/db/products.ts` — `addProduct`, `updateProduct`, `deleteProduct`, `listProducts`.
- `src/lib/db/schema.test.ts`, `src/lib/db/products.test.ts` — unit tests.
- `src/i18n/routing.ts` — `defineRouting({locales: ['en','sw'], defaultLocale: 'en', localePrefix: 'never'})`.
- `src/i18n/request.ts` — `getRequestConfig`, falls back to `defaultLocale` via `hasLocale`.
- `src/proxy.ts` — **not** `middleware.ts** (Next.js 16 renamed the convention — see Deviations); wraps `next-intl`'s `createMiddleware(routing)`.
- `messages/en.json`, `messages/sw.json` — one `shell` namespace (`appName`, `tagline`) each.
- `src/app/[locale]/layout.tsx` — moved from `src/app/layout.tsx`; async Server Component, awaits `params`, calls `notFound()` for unknown locales, wraps children in `NextIntlClientProvider`.
- `src/app/[locale]/page.tsx` — renders `<ShellHome />`.
- `src/components/ShellHome.tsx` — `"use client"` component using `useTranslations("shell")`; extracted specifically so it's unit-testable (see Deviations).
- `src/components/ShellHome.test.tsx` — Testing Library test.
- `src/app/manifest.ts` — Next's typed manifest route; references `/icon-192.png`, `/icon-512.png`.
- `public/icon-192.png`, `public/icon-512.png` — solid-color (`#171717`) placeholder PNGs, generated with a throwaway Node script (raw PNG encoding via `zlib.deflateSync`, no dependency added).
- `src/app/sw.ts` — Serwist entry (`defaultCache` runtime caching, `skipWaiting`/`clientsClaim`/`navigationPreload`, no offline-fallback page yet).
- `next.config.ts` — wraps `withSerwist(withNextIntl(nextConfig))`; kept the existing `turbopack.root` pin (now vestigial for `build`/`dev` since both pass `--webpack`, but harmless and still used by any tool that invokes Turbopack directly).
- `tsconfig.json` — added `"webworker"` to `lib`, `"types": ["@serwist/next/typings"]`, excluded `public/sw.js`.
- `eslint.config.mjs` — added `public/sw.js` / `public/swe-worker*.js` to `globalIgnores` (the generated file was failing lint).
- `.gitignore` — added Serwist output patterns, Playwright report/result dirs, and un-ignored `.env.example`/`.env.local.example`.
- `.env.local.example` — placeholder names only, for Phases 5/6/8's variables (see note under Deviations on the `.env.example` vs `.env.local.example` naming in the plan itself).
- `e2e/app-shell.spec.ts` — loads `/`, asserts shell text visible, asserts a service worker registers **and reaches `active` state**.

## Design Decisions & Rationale

**(a) Versions installed:**
`dexie@^4.4.4`, `dexie-react-hooks@^4.4.0`, `next-intl@^4.13.2`, `@serwist/next@^9.5.11`, `serwist@^9.5.11`. No breaking changes encountered against what the phase file assumed — the only real friction was Next.js 16/Turbopack-related (see Deviations), not these libraries' own APIs.

**(b) Final shapes** (`src/lib/db/schema.ts`, verbatim):
```ts
export interface Product {
  id: string;
  name: string;
  category: string;
  barcode?: string;      // optional: unbarcoded/loose goods
  priceKES: number;      // whole KES, integer
  stockQty: number;      // integer, never negative
  source: "barcode" | "photo" | "manual";
}

export interface Transaction {
  id: string;
  productId: string;
  quantity: number;
  totalKES: number;      // whole KES, integer
  paymentMethod: "cash" | "mpesa";
  status: "completed" | "pending" | "failed";
  createdAt: number;     // epoch ms
}

export interface SyncQueueEntry {
  id: string;
  type: string;          // Phase 5 owns the concrete type vocabulary
  payload: unknown;      // Phase 5 owns the concrete payload shapes
  createdAt: number;
  syncedAt?: number;
}
```
No `shopId` field on `Product`/`Transaction` per ADR-2 (single value lives in Phase 2's `shopProfile` table).

**(c) Service-worker verification:** `page.waitForFunction` polling `navigator.serviceWorker.getRegistration()` until a registration exists **and** `registration.active !== null`, then a follow-up `page.evaluate` asserting `active.state === "activated"`. Polling for `active` (not just "registered") mattered — a registration can exist while still `installing`, which would have made the assertion flaky/meaningless.

**(d) Locale fallback:** `src/i18n/request.ts` uses `hasLocale(routing.locales, requested)` — any unrecognized/absent locale falls back to `routing.defaultLocale` (`"en"`), never throws.

## Deviations from Requirements

1. **`middleware.ts` → `proxy.ts`.** Not anticipated by name in the phase file (ADR-6 mentioned cookie-based locale but not the file convention). Next.js 16 deprecated `middleware.ts` in favor of `proxy.ts` (same default-export shape; `createMiddleware(routing)` from `next-intl` needed zero changes). Verified live against `node_modules/next/dist/docs` and next-intl's own migration notes before writing this — confirmed **not** guessed. File lives at `src/proxy.ts` (sibling of `src/app`, per Next's own placement rule).

2. **`@serwist/next` requires webpack, not Turbopack — for both `dev` and `build`.** This is the significant one. Next.js 16 defaults *both* `next dev` and `next build` to Turbopack. `@serwist/next`'s plugin only hooks into webpack's compiler; under Turbopack it silently produced **no `public/sw.js` at all** (not even a broken one — first attempt at `npm run build` succeeded with zero errors and zero warnings about it being skipped for `build` specifically, and `ls public/` showed no `sw.js`). Fix: `package.json`'s `dev`/`build` scripts now pass `--webpack` explicitly (`next dev --webpack`, `next build --webpack`). Confirmed working: build output shows `✓ (serwist) Bundling the service worker script...` and `public/sw.js` is written; the Playwright e2e test (running against `npm run dev --webpack` via `webServer`) observes a real registered-and-activated service worker. This trades away Turbopack's speed advantage for the entire project, which is a real cost for later phases' dev-loop iteration speed — flagging this explicitly since it affects every subsequent phase's `npm run dev` experience, not just this one.
   - Not pursued: `@serwist/turbopack` (explicitly labeled experimental in the tool's own warning message) and "configurator mode" (undocumented scope/effort in the time available) — `--webpack` was the documented, zero-new-dependency fix.

3. **`src/app/[locale]/layout.test.tsx` was not written as specified.** The phase file asked for a Testing Library test of the layout file directly. `layout.tsx` is an async Server Component that calls `next-intl/server`'s `getMessages()` and `next/navigation`'s `notFound()` — both depend on Next.js's request-scoped runtime (`AsyncLocalStorage`-based context set up during real request handling), which does not exist under plain Vitest/jsdom. Rather than deeply mocking Next.js internals to force a Server Component to render outside a request, the shell's actual content was extracted into a `"use client"` component (`src/components/ShellHome.tsx`) that consumes `useTranslations` via React context — the officially-supported, genuinely-testable next-intl pattern (wrap in `<NextIntlClientProvider>` directly in the test). `page.tsx` is now a two-line Server Component that renders `<ShellHome />`. The test (`src/components/ShellHome.test.tsx`) proves the same thing the required test was after (the app name renders from the message catalog) at a layer that's actually testable — per global-rules §8, "test at the lowest layer that proves the behavior."

4. **`.env.example` vs `.env.local.example` naming.** The plan itself is inconsistent here (`global-rules.md` says `.env.example`; Phases 5/6/8 say `.env.local.example`). Went with `.env.local.example` since it more accurately names what it's a template for (`.env.local`, the file Next.js actually loads for local dev) and matches the majority of phase files. Flagging so nobody goes looking for a second file that doesn't exist.

## Issues Encountered & How They Were Fixed

- **`next build` under Turbopack produced no `sw.js` and no error/warning specific to `build`.** Only `next dev --turbopack` printed an explicit warning; `next build` (also Turbopack by default in Next 16) stayed silent and just didn't run the step. Found by explicitly checking `ls public/` after a build rather than trusting a clean exit code — worth remembering for later phases: a clean build is not proof a build *step* ran. Fixed per Deviation #2 above.
- **`tsconfig.json` needed both `"dom"` and `"webworker"` in `lib`** for `src/app/sw.ts` (Serwist's own documented setup). Was concerned this would produce duplicate-global-declaration errors (`self` is typed differently in each lib) across the rest of the app, but `skipLibCheck: true` (already present in the scaffolded tsconfig) suppressed any such conflict — `npm run build`'s TypeScript check passed clean. No further action needed, but noting this for whoever touches `tsconfig.json` next: don't remove `skipLibCheck` without re-checking this.
- **ESLint failed on the generated `public/sw.js`** (`no-assign-module-variable` + an unused-var warning) the first time `npm run lint` was run after a build had produced that file. Added it to `eslint.config.mjs`'s `globalIgnores` — it's a build artifact, not source, and is already gitignored.

## Tests Written

- `src/lib/db/schema.test.ts`: `db` singleton — re-importing the module returns the same instance; `products`/`transactions`/`syncQueue` tables exist.
- `src/lib/db/products.test.ts`: `addProduct` persists and `listProducts` returns it; `updateProduct` changes `stockQty` and leaves other fields untouched; `deleteProduct` removes a product; `listProducts` returns `[]` on an empty database; two products with the same barcode both save successfully.
- `src/components/ShellHome.test.tsx`: renders inside a manually-constructed `NextIntlClientProvider` with the `en` shape and asserts `"DukaPOS"` is visible.
- `e2e/app-shell.spec.ts`: navigates to `/`, asserts shell text visible, asserts a service worker reaches the `activated` state.

## How to Run Automated Tests

```bash
npm run test:unit   # Vitest — no dev server needed
npm run test:e2e    # Playwright — starts `npm run dev` itself via webServer; first run also needs `npx playwright install chromium` once
```

## How to Manually Verify This Phase

1. Run `npm run dev`, open `http://localhost:3000` in a Chromium-based browser. Confirmed: shell renders "DukaPOS" / tagline, no console errors.
2. DevTools → Application → Service Workers: confirmed a worker registered and reached "activated" — this required the `--webpack` fix in Deviation #2; before that fix, no service worker ever appeared under `next dev` at all (not "sometimes flaky" — reliably absent).
3. DevTools → Application → IndexedDB: confirmed a `DukaDB` database exists with `products`, `transactions`, `syncQueue` object stores (empty, as expected — nothing writes to them yet in this phase).
4. DevTools → Network → Offline, then reload: confirmed the shell still loads from the service worker's precache.

## Known Debt

- `messages/sw.json` contains a deliberately-written (not machine-translated, not English-placeholder) Swahili translation of the two Phase 1 strings, but it has **not** been reviewed by a native speaker — per PRD §9's explicit risk ("have a native speaker review copy before final build, not machine-translate"), flag both strings for Phase 9's review pass rather than trusting them as final.
- No `DEBT(prudent-deliberate)` code comments were needed this phase — the two real compromises (Turbopack→webpack, layout test restructuring) are architectural/tooling decisions already fully documented above under Deviations, not shortcuts inside the shipped logic itself.

## Handoff Notes for Phase 2

- Import `db` from `@/lib/db/schema`; import `addProduct`/`updateProduct`/`deleteProduct`/`listProducts` from `@/lib/db/products`. Add new tables via a **new** `this.version(2).stores({...})` block in `DukaDB`'s constructor — do not edit the `version(1)` block.
- The `NextIntlClientProvider` boundary lives in `src/app/[locale]/layout.tsx`. Anything Phase 2 renders under `[locale]/` automatically has translations available; Phase 2's own strings go into the `messages/en.json` / `messages/sw.json` files under a new top-level namespace (e.g. `"onboarding"`, `"lock"`) — don't nest under `"shell"`.
- **`npm run dev` now means `next dev --webpack`, not Turbopack.** This is slower to start and slower to hot-reload than a stock Next 16 project. If a future phase's agent is confused about missing Turbopack speed or sees `▲ Next.js 16.2.10 (webpack)` in the terminal instead of `(Turbopack)`, that's expected — it's required for the service worker to exist, not a misconfiguration to "fix."
- The PIN-lock gating Phase 2 builds should wrap `{children}` *inside* `NextIntlClientProvider` in the `[locale]` layout (translations must be available on both the lock screen and onboarding flow), not sit outside/above it.
- No `shopId`-bearing table exists yet — Phase 2 is what adds `shopProfile` via a `version(2)` migration.
