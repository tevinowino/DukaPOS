# Software Architecture Document

**Product:** DukaPOS
**Track:** Small Business & FinTech
**Event:** Build with Gemma: GDG on Campus UoN
**Author:** Tevin Owino
**Date:** July 2026

---

## 1. Purpose

This document describes the technical architecture of DukaTrack: a Progressive Web App (PWA) that lets small Kenyan shop owners scan/photograph products, track inventory, record sales, and accept M-Pesa payments, with Gemma 4 handling product identification from photos and natural language stock updates. It's written to guide implementation and to serve as the architecture reference for the hackathon Kaggle Writeup.

## 2. Architectural Goals & Constraints

| Goal | Driver |
|---|---|
| Offline-first | Target users have inconsistent connectivity |
| Simple, bilingual UI | Non-technical users, English/Swahili |
| Swappable AI backend | Hosted API by default; must support self-hosted fallback without app-wide changes |
| Fast to build, reliable to demo | 4-day hackathon timeline, live judging |
| Secure by default | API keys and payment secrets never exposed client-side |

## 3. High-Level System Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Shopkeeper's Phone (Browser)               │
│  ┌───────────────────────────────────────────────────────┐   │
│  │              Next.js PWA (React, App Router)            │   │
│  │  - Barcode scanner (BarcodeDetector API / ZXing)         │   │
│  │  - Camera capture (product photo)                        │   │
│  │  - Sale flow, stock views, NL text input                 │   │
│  │  - next-intl (English / Swahili)                         │   │
│  │  - Service Worker (offline shell caching)                │   │
│  │  - Dexie.js → IndexedDB (local-first data store)          │   │
│  └───────────────────────────────────────────────────────┘   │
└───────────────────────────┬─────────────────────────────────┘
                             │ HTTPS (when online)
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                Next.js API Routes (Vercel, server-side)       │
│  /api/identify-product   /api/parse-stock   /api/summary       │
│  /api/checkout           /api/webhooks/paystack                │
│  /api/sync                                                     │
│                             │                                  │
│           ┌─────────────────┼─────────────────┐                │
│           ▼                                   ▼                │
│  ┌──────────────────┐              ┌─────────────────────┐    │
│  │  lib/ai/           │              │  lib/payments/       │    │
│  │  gemmaClient.ts     │              │  paystackClient.ts   │    │
│  │  (provider switch)  │              └─────────────────────┘    │
│  └────────┬───────────┘                        │                │
│           │                                     ▼                │
│  ┌────────┴─────────┐                  ┌──────────────────┐    │
│  ▼                   ▼                  │  Paystack API     │    │
│ hosted.ts      selfhosted.ts            │  (M-Pesa STK push)│    │
│  │                   │                  └──────────────────┘    │
└──┼───────────────────┼─────────────────────────────────────────┘
   ▼                   ▼
┌─────────────────┐  ┌──────────────────────┐
│ Google AI Studio │  │ Self-hosted GPU       │
│ Gemini API        │  │ (RunPod, if required) │
│ gemma-4-26b-a4b-it│  │ FastAPI + Gemma 4     │
└─────────────────┘  └──────────────────────┘
                             │
                             ▼
                  ┌─────────────────────┐
                  │  Backend data store   │
                  │  (sync target, e.g.   │
                  │  Convex/Postgres)     │
                  └─────────────────────┘
```

## 4. Component Breakdown

### 4.1 Frontend (Next.js PWA)

- **Framework:** Next.js App Router, deployed on Vercel
- **Offline storage:** Dexie.js over IndexedDB, source of truth for the UI; all reads/writes hit local storage first
- **Service Worker:** caches app shell and static assets for instant offline load
- **Localization:** `next-intl`, English/Swahili toggle, static UI strings only (AI-generated text is not pre-translated, it's generated per-request in whichever language the input was)
- **Scanning:** native `BarcodeDetector` API with `@zxing/browser` fallback
- **Camera capture:** standard `<input type="file" capture="environment">` or `getUserMedia`, image compressed client-side before upload

### 4.2 API Layer (Next.js API Routes)

All server-side logic lives here. This is also where every secret (Gemma API key, Paystack secret key) is held, never shipped to the client.

| Route | Responsibility |
|---|---|
| `/api/identify-product` | Accepts image, calls `lib/ai/gemmaClient`, returns normalized `ProductGuess` |
| `/api/parse-stock` | Accepts text, calls `gemmaClient.parseStockUpdate`, returns structured stock changes |
| `/api/summary` | Accepts recent transactions, returns a plain-language summary |
| `/api/checkout` | Initiates Paystack M-Pesa STK push for a sale |
| `/api/webhooks/paystack` | Receives and verifies Paystack payment confirmation |
| `/api/sync` | Accepts queued local changes, persists to backend store |

### 4.3 AI Layer: `lib/ai/`

The core architectural decision supporting the self-host requirement.

```
lib/ai/
  ├── gemmaClient.ts     # public interface, all app code imports this
  ├── types.ts           # ProductGuess, StockUpdate, shared shapes
  └── providers/
        ├── hosted.ts      # Google AI Studio / Gemini API (gemma-4-26b-a4b-it)
        └── selfhosted.ts  # Calls own FastAPI endpoint (RunPod-hosted)
```

- `gemmaClient.ts` selects the active provider based on `AI_PROVIDER` env var
- Both providers implement the same function signatures and return the same normalized types
- No other part of the codebase references a provider directly or knows which one is active
- Switching providers = one environment variable change + redeploy, no code change

### 4.4 Payments Layer: `lib/payments/`

- `paystackClient.ts`: wraps Paystack Charge API (M-Pesa channel) and webhook signature verification
- Sandbox mode for hackathon demo; live mode is a post-hackathon concern requiring KYC

### 4.5 Data Model (simplified)

```
Product
  id, name, category, barcode?, priceKES, stockQty, source ('barcode'|'photo'|'manual')

Transaction
  id, productId, quantity, totalKES, paymentMethod ('cash'|'mpesa'),
  status ('completed'|'pending'|'failed'), createdAt

SyncQueue (local only)
  id, type, payload, createdAt, syncedAt?
```

- Local (IndexedDB): full `Product` and `Transaction` tables, plus a `SyncQueue` for anything created offline
- Backend: mirrors the same shape, receives pushes from `/api/sync`

## 5. Key Flows

### 5.1 Unbarcoded product add (Gemma 4 vision)

1. Shopkeeper photographs item → image compressed client-side
2. App calls `/api/identify-product` → `gemmaClient.identifyProduct()` → active provider → Gemma 4
3. Response normalized to `ProductGuess`, returned to client
4. Shopkeeper confirms/edits → saved to IndexedDB → queued for sync

### 5.2 Natural language stock update

1. Shopkeeper types a stock update (English/Swahili/mixed)
2. `/api/parse-stock` → `gemmaClient.parseStockUpdate()` → function-calling response → structured `StockUpdate[]`
3. App applies changes to local `Product` records → queued for sync

### 5.3 Sale with M-Pesa payment

1. Shopkeeper selects item(s), chooses "Pay via M-Pesa"
2. `/api/checkout` → Paystack Charge API → customer receives STK push
3. Transaction saved locally as `pending`
4. Paystack webhook hits `/api/webhooks/paystack` (signature verified) → transaction marked `completed` → stock deducted

### 5.4 Offline → online sync

1. All writes happen to IndexedDB first, regardless of connectivity
2. Background Sync API (or a simple retry-on-reconnect listener) triggers `/api/sync` once online
3. Server merges queued changes into the backend store
4. Any AI-dependent action taken while offline (photo ID, NL parsing) is queued and resolved once connectivity returns, shown as "pending" in the UI in the meantime

## 6. Deployment Architecture

| Environment | Where | Notes |
|---|---|---|
| Frontend + API routes | Vercel | Free tier sufficient for hackathon demo |
| AI (default) | Google AI Studio / Gemini API | `gemma-4-26b-a4b-it`, free tier, ~15 RPM |
| AI (fallback, if self-hosting is required) | RunPod Serverless | FastAPI wrapper, GPU-backed, deployed only if needed |
| Payments | Paystack | Sandbox mode for demo |

## 7. Security Considerations

- All secrets (`GEMMA_API_KEY`, `PAYSTACK_SECRET_KEY`) server-side only, via environment variables, never in client bundles
- Paystack webhook payloads verified via signature before being trusted
- PIN-based auth stored hashed, not plain text
- `.env.local` gitignored; `.env.example` committed with variable names only

## 8. Version Control Strategy

- `main`: always demo-ready
- `feature/*` branches per feature (barcode, gemma-photo-id, gemma-stock-parse, paystack, i18n)
- Tag known-good states before the deadline: `v1-demo-ready`, incrementing as needed
- `PROVIDER_SWITCHING.md` documents the one-variable AI provider switch for judges/organizers

## 9. Architecture Decision Records

These decisions resolve gaps and open questions left in earlier drafts of this document. They are binding; `plan/` is written against them.

### ADR-1: Backend data store is Convex

Section 3/4.5 left the sync backend as "e.g. Convex/Postgres." Decided: **Convex**. Rationale: TypeScript-native schema/functions, no separate ORM/migration tooling, realtime queries available if a later feature needs them, fastest path to a working `/api/sync` target inside a 4-day build. Next.js API routes remain the only thing the browser talks to (§4.2 unchanged) — they call Convex server-side via `fetchQuery`/`fetchMutation`/`fetchAction` (`convex/nextjs`) or `ConvexHttpClient`, using `NEXT_PUBLIC_CONVEX_URL`. The browser never imports a Convex client directly; this preserves the existing secret/trust boundary in §7.

### ADR-2: Local PIN lock, not a server-verified account

§5 ("Account & Access") specified "Phone number + PIN login" without a corresponding data model entry, and no auth flow appears in §5's key flows. Decided: this is a **device-level app lock**, not server authentication. The PIN is set and verified entirely client-side (hashed, stored in IndexedDB); there is no login network call and no server session. A `shopId` (UUID, generated on first launch and persisted locally) is the tenant key every synced record carries — it is the sole mechanism that scopes Convex reads/writes to "this shop's data," not a cryptographic identity. This matches the PRD's single-shop/single-user scope and removes an entire auth-backend phase from the timeline.

**DEBT(prudent-deliberate):** `shopId` is an unguessable UUID, not an authenticated credential — anyone who obtains it could read/write that shop's synced data. Acceptable for a single-device hackathon MVP where the UUID never leaves the device or the direct Convex calls. Remediation path (post-hackathon): move to ADR-2's rejected alternative (server-verified phone+PIN sessions) before any multi-device or multi-tenant exposure.

### ADR-3: How the client learns a pending M-Pesa payment completed (missing flow, §5.3)

§5.3 stated the webhook marks the transaction completed and stock is deducted, but never specified how the client — whose local IndexedDB is the source of truth for stock — learns this happened, since a server-side webhook cannot write into a specific browser's IndexedDB. Decided: while the "waiting for payment" screen is open, the client polls `GET /api/checkout/status?reference=` (a Next.js route, not a direct Convex client call) every 3s for up to 90s. That route runs `fetchQuery` against Convex for the transaction's current status. The webhook handler (`/api/webhooks/paystack`) is what actually calls the Convex mutation that flips status to `completed` and decrements stock. Once the poll observes `completed`, the client applies the same stock decrement to its local Dexie tables and marks the local transaction `completed`. If the poll window elapses without confirmation, the transaction stays `pending` and is reconciled on the next `/api/sync` pass. No Convex client SDK is added to the frontend bundle; the browser's only server contact remains Next.js API routes.

### ADR-4: Service worker via Serwist, not next-pwa

§4.1 said "Service Worker" without naming a library. `next-pwa` is unmaintained; **Serwist** (`@serwist/next`) is its actively maintained successor and the option Next.js's own docs point to for App Router. Use it for app-shell precaching.

### ADR-5: Dexie reactivity via `dexie-react-hooks`

UI components read local data with `useLiveQuery` (`dexie-react-hooks`, ^1.1.3+), which re-renders on any Dexie-level write (including from a service worker or another tab) and is SSR-safe in Next.js App Router (falls back to the query's initial value on the server, resolves client-side).

### ADR-6: Locale strategy is cookie-based, not URL-prefixed

§4.1 named `next-intl` without specifying routing. Decided: `localePrefix: 'never'` — a `[locale]` route segment still exists (required by next-intl), but the URL never shows it; the active locale is read from a cookie and switched via an in-app toggle, not a route change. Matches the PRD's "English/Swahili UI toggle" (a button, not separate URLs) for a single-shop app with no SEO requirement.

## 10. Risks & Architectural Mitigations

| Risk | Mitigation |
|---|---|
| Organizers require self-hosting | `lib/ai/` adapter pattern isolates the switch to one env var |
| Gemma 4 API latency mid-demo | Loading states on every AI call; core scan/sell loop never blocks on AI |
| Connectivity drop mid-transaction | Local-first writes, background sync, no data loss |
| Swahili output quality inconsistent | AI output always shown for shopkeeper confirmation before it's saved; never auto-committed |
| Provider response shape drift | Shared `types.ts` and normalization in each provider file, not left to callers |