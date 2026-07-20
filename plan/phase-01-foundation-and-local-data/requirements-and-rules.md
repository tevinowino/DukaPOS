# Phase 1 — Foundation & Local Data Layer: test tooling, Dexie schema, PWA shell, i18n scaffold

> Audience: implementing AI agent. Read [`plan/global-rules.md`](../global-rules.md) first. There is no Phase 0 overview — this is the first phase; instead read `AGENTS.md`/`CLAUDE.md` at the repo root (Next.js version warning) and `PRD.md` / `ARCHITECTURE.md` in full.

## 1. Objective

When this phase is done: `npm run dev` shows an installable, offline-capable PWA shell with an English/Swahili-ready layout (Swahili strings may still be placeholder English — real translation is Phase 9); `npm run test:unit` runs Vitest + Testing Library against a real (if trivial) test; `npx playwright test` runs a real (if trivial) E2E smoke test; and a Dexie database with `Product`, `Transaction`, and `SyncQueue` tables exists with typed helpers, fully unit-tested, ready for Phase 2+ to build features on top of. Nothing user-facing beyond a shell screen is required yet — this phase is infrastructure only.

## 2. Read First

- `PRD.md` §6 (Non-Functional Requirements — offline, performance, installability rows) and §7 (Technical Architecture)
- `ARCHITECTURE.md` §4.1 (Frontend), §4.5 (Data Model), §9 ADR-4 (Serwist), ADR-5 (dexie-react-hooks), ADR-6 (locale strategy)
- `AGENTS.md` at repo root — this Next.js major has breaking changes from training data; check `node_modules/next/dist/docs/` before writing App Router code you're unsure of

## 3. Deliverables

| Path | Purpose |
|---|---|
| `package.json` | Adds `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`, `@vitejs/plugin-react`, `@playwright/test`, `dexie`, `dexie-react-hooks`, `@serwist/next`, `serwist`, `next-intl`; adds `test:unit`, `test:unit:watch`, `test:e2e` scripts |
| `vitest.config.ts` | Vitest config: jsdom environment, React plugin, path alias matching `tsconfig.json`'s `@/*` |
| `playwright.config.ts` | Playwright config: `webServer` running `next dev`, base URL, one project (Chromium is sufficient for the hackathon demo target) |
| `src/lib/db/schema.ts` | Dexie database class/instance with `products`, `transactions`, `syncQueue` tables and their TypeScript types |
| `src/lib/db/products.ts` | Pure functions: `addProduct`, `updateProduct`, `deleteProduct`, `listProducts` (thin wrappers around Dexie, but centralize here so Phase 3 doesn't touch raw `db.products` calls from components) |
| `src/lib/db/*.test.ts` | Unit tests for the above using `fake-indexeddb` (or Dexie's own test-friendly in-memory mode) |
| `src/app/[locale]/layout.tsx` | Root locale-aware layout wrapping `NextIntlClientProvider` |
| `src/i18n/routing.ts`, `src/i18n/request.ts` | next-intl routing config (`localePrefix: 'never'`) and request config per ADR-6 |
| `messages/en.json`, `messages/sw.json` | Message catalogs; `sw.json` may duplicate English strings for now with a `// TODO Phase 9: real Swahili` note is **not allowed inside JSON** — instead track this in this phase's `overview.md` "Known Debt" |
| `src/app/manifest.ts` | Web app manifest (name "DukaPOS", icons, `display: standalone`, theme color) |
| `src/app/sw.ts` (or wherever `@serwist/next` expects it) | Service worker entry precaching the app shell |
| `next.config.ts` | Wrap existing config with `withSerwist` (keep the existing `turbopack.root` pin) |
| `e2e/app-shell.spec.ts` | Playwright smoke test: app loads, shows the shell, and (per Serwist setup) registers a service worker |

## 4. Implementation Steps (in order)

1. **Install dependencies.** `npm install dexie dexie-react-hooks next-intl @serwist/next serwist` and `npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event fake-indexeddb @playwright/test`. Run `npx playwright install chromium` (browser binary, not an npm dep).
2. **Wire Vitest.** Create `vitest.config.ts` with `environment: 'jsdom'`, `setupFiles` pointing to a small `vitest.setup.ts` that imports `@testing-library/jest-dom` and installs `fake-indexeddb/auto` (so Dexie works under Vitest without a real browser). Add `"test:unit": "vitest run"` and `"test:unit:watch": "vitest"` to `package.json` scripts.
3. **Wire Playwright.** `npx playwright init` is not needed — hand-write `playwright.config.ts` with `webServer: { command: 'npm run dev', url: 'http://localhost:3000', reuseExistingServer: !process.env.CI }`. Add `"test:e2e": "playwright test"`.
4. **Write the Dexie schema first, as a docstring-first contract.** In `src/lib/db/schema.ts`, define TypeScript interfaces for `Product`, `Transaction`, `SyncQueueEntry` matching `ARCHITECTURE.md` §4.5 exactly, plus the fields ADR-2 requires (no `shopId` field needed on local rows — `shopId` is a single app-level value from Phase 2, not per-row, since this is single-shop-per-device). Then `class DukaDB extends Dexie` with `version(1).stores({...})` — index `products` on `id, barcode, category`; index `transactions` on `id, productId, status, createdAt`; index `syncQueue` on `id, syncedAt`. Export a singleton `db = new DukaDB()`.
5. **Write `src/lib/db/products.ts`.** Doc-comment each exported function's contract before its body (per global-rules §1). Functions are pure wrappers with no React/Next.js imports, so they're usable from API routes later too.
6. **Set up next-intl per ADR-6.** Follow the current next-intl App Router docs (`https://next-intl.dev/docs/getting-started/app-router` at time of writing) for the `localePrefix: 'never'` pattern: `[locale]` segment still exists in the folder structure, middleware still runs, but the URL never shows the locale — it's read from a cookie. Move the existing `src/app/page.tsx` content into `src/app/[locale]/page.tsx`.
7. **Create `messages/en.json` and `messages/sw.json`** with a handful of real keys used by the shell (app name, a placeholder nav label or two) — just enough for `layout.tsx` to prove the wiring works. Do not invent large amounts of UI copy this phase; later phases add their own keys as they build their screens.
8. **Set up Serwist per ADR-4.** Follow `@serwist/next`'s current setup docs: wrap `next.config.ts` with `withSerwist`, create the service worker entry file, and add `src/app/manifest.ts` (Next.js's built-in typed manifest route, not a static `manifest.json`) with `name: "DukaPOS"`, `short_name: "DukaPOS"`, `display: "standalone"`, a `theme_color`, and at minimum a 192px and 512px icon (placeholder icons are fine this phase — real branding isn't in scope).
9. **Write the shell layout.** `src/app/[locale]/layout.tsx` renders `<html>`/`<body>` with `NextIntlClientProvider`, minimal nav placeholder. No auth gating yet (that's Phase 2) — the shell is reachable by anyone at this phase.
10. **Write tests as you go per step**, not batched at the end (global-rules §8). See §6 below for the exact required set.
11. **Verify:** `npm run build` succeeds, `npm run test:unit` passes, `npx playwright test` passes, `npm run dev` shows the shell and DevTools → Application → Service Workers shows one registered.

## 5. Edge Cases & Required Handling

| Edge case | Required handling |
|---|---|
| Dexie table opened twice (e.g. hot reload in dev) | Use a module-level singleton (`export const db = new DukaDB()`), never `new DukaDB()` inside a component or hook. Test it: a second import of the module returns the same instance (`===`). |
| `addProduct` called with a duplicate `barcode` | Decide and document the policy: barcode is not a unique-indexed constraint at the Dexie level in this phase (Phase 3 owns barcode-scan UX and can add a duplicate-check there) — this phase's `addProduct` just persists what it's given. Test it: two products with the same barcode both save successfully (proves no premature constraint was added). |
| `listProducts` called on an empty database | Returns `[]`, not `undefined` or a thrown error. Test it. |
| Vitest running Dexie code without a real IndexedDB | `fake-indexeddb/auto` is imported in `vitest.setup.ts` before any test file runs; confirm by writing one test that adds and reads back a product. |
| Locale cookie absent on first visit | next-intl / the routing config falls back to a defined default locale (`en`) without throwing. Covered by the Playwright smoke test loading successfully with no cookie set. |

## 6. Required Tests

- `src/lib/db/schema.test.ts`: importing `db` twice returns the same singleton instance; the `products`, `transactions`, `syncQueue` tables exist on the instance.
- `src/lib/db/products.test.ts`: `addProduct` persists a product with concrete fields (name `"Sugar 1kg"`, `priceKES: 150`, `stockQty: 20`, `source: 'manual'`) and `listProducts()` returns it; `updateProduct` changes `stockQty` on an existing id and leaves other fields untouched; `deleteProduct` removes a product such that `listProducts()` no longer includes it; `listProducts()` on a fresh empty db returns `[]`; two `addProduct` calls with the same `barcode` value both succeed (documents the no-uniqueness-constraint decision from §5).
- `src/app/[locale]/layout.test.tsx` (Testing Library): renders the layout with the `en` message catalog and asserts the app name text is visible.
- `e2e/app-shell.spec.ts` (Playwright): navigates to `/`, asserts the page loaded (title or visible shell text), and asserts `navigator.serviceWorker.getRegistration()` resolves to a registration (proves Serwist wired correctly) — note the exact evaluation technique used, since Playwright + service workers can be timing-sensitive; document what worked in `overview.md`.

## 7. Phase Rules

- No product-management UI, no sales UI, no PIN lock, no AI, no payments, no Convex in this phase — those are Phases 2–8. If you find yourself building a form, stop; that belongs to a later phase.
- `messages/sw.json` gets only the handful of keys the shell actually renders this phase — do not pre-populate the full app's eventual string set speculatively.
- Icons/branding are placeholders; do not spend time on visual design here.
- Do not add authentication of any kind — Phase 2 owns the PIN lock, and per ADR-2 there is never a server-side account system to build.

## 8. Definition of Done

1. `npm run dev` serves an installable PWA shell at `/`; a service worker registers; the shell renders using the `en` locale by default.
2. All §6 tests green (`npm run test:unit` and `npx playwright test`); `npm run lint` and `npm run build` clean.
3. `.env.example` created (empty/placeholder — first real vars appear in Phase 5+) so later phases have a file to append to.
4. `overview.md` completed, including: the exact Serwist setup steps that worked (docs drift fast — record what you actually did), the final `dexie` + `dexie-react-hooks` + `next-intl` + `@serwist/next` versions installed, and how you verified service-worker registration in Playwright.
