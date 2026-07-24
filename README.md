# DukaPOS

An offline-first, AI-powered Progressive Web App (PWA) designed to empower small kiosk owners (*dukas*) and informal merchants in Kenya. DukaPOS leverages the advanced natural language and vision capabilities of Gemma 4 (`gemma-4-26b-a4b-it`) to handle unbarcoded inventory cataloging, parse bilingual stock updates (English, Swahili, Sheng), and generate plain-language sales summaries, all while keeping transactions running smoothly with zero internet connectivity.

---

## 📖 Table of Contents
1. [Abstract & Problem Statement](#-abstract--problem-statement)
2. [Key Features](#-key-features)
3. [System Architecture](#-system-architecture)
4. [Tech Stack](#-tech-stack)
5. [Directory Structure](#-directory-structure)
6. [Getting Started & Local Setup](#-getting-started--local-setup)
7. [Deployment Guide](#-deployment-guide)
8. [Testing & Verification](#-testing--verification)
9. [Performance Metrics](#-performance-metrics)
10. [License](#-license)

---

## 🎯 Abstract & Problem Statement

In Nairobi's retail ecosystem, many informal merchants and kiosk owners conduct their day-to-day transactions without digital tools. Supermarket-grade Point-of-Sale (POS) systems fail in this segment because they expect a stable internet connection, barcoded packaging, and complex software configurations. Consequently, stock levels and sales logs are kept in paper notebooks or the shopkeeper's head, leading to inventory shrinkage and inefficient replenishment.

**DukaPOS** solves this gap by providing an offline-first mobile web experience optimized for Kenyan shopkeepers. It uses **Gemma 4** to support:
- **Vision-based Cataloging:** Identifies loose, unbarcoded items (e.g. grains, baked goods) from a smartphone camera photo.
- **Natural Language Parsing:** Translates loose text updates (SMS/WhatsApp style, bilingual English/Swahili) into schema-compliant inventory changes.
- **Plain-language summaries:** Synthesizes complex lists of transactions into simple, actionable end-of-day summaries.

---

## ✨ Key Features

- **Offline-First Resilience:** The entire sales flow, product entry, and catalog loading run with zero network connectivity via service worker app shell caching.
- **Dexie/IndexedDB Source of Truth:** All local updates write to local IndexedDB instantly. UI components react dynamically using Live Queries.
- **Background Sync Queue:** Write actions performed offline are stored in a local sync queue and drained to the serverless database automatically when connectivity returns.
- **Gemma 4 Adapter Pattern:** AI services are abstracted into swappable adapters. By default, it runs on Google AI Studio (`gemma-4-26b-a4b-it`), but it can switch to a self-hosted FastAPI GPU endpoint via a single environment variable change.
- **Kenyan Mobile Money Integration:** Integrates with Paystack for M-Pesa STK push checkout, displaying pending transactions until webhooks confirm successful payment.
- **Bilingual Interface:** Toggleable English and Swahili translations handled client-side without page reloads to keep translation responsive while offline.

---

## 🏗️ System Architecture

DukaPOS divides its logic cleanly between local-first clients and serverless backend routes:

```
┌─────────────────────────────────────────────────────────────┐
│                    Shopkeeper's Phone (Browser)               │
│  ┌───────────────────────────────────────────────────────┐   │
│  │              Next.js PWA (React, App Router)            │   │
│  │  - Barcode scanner (BarcodeDetector API / ZXing)         │   │
│  │  - Camera capture (product photo)                        │   │
│  │  - Sale flow, stock views, NL text input                 │   │
│  │  - next-intl (English / Swahili)                         │   │
│  │  - Service Worker (offline shell caching via Serwist)    │   │
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
│ Gemini API        │  │ (RunPod-hosted GPU)   │
│ gemma-4-26b-a4b-it│  │ FastAPI + Gemma 4     │
└─────────────────┘  └──────────────────────┘
                             │
                             ▼
                   ┌─────────────────────┐
                   │   Convex Backend    │
                   │   Cloud Sync DB     │
                   └─────────────────────┘
```

---

## 💻 Tech Stack

- **Frontend:** Next.js 16 (App Router), React 19, Tailwind CSS 4, `next-intl` (Localization)
- **PWA Capabilities:** Serwist (`@serwist/next`) for service worker lifecycle management
- **Local Storage:** Dexie.js (wrapper for IndexedDB) and `dexie-react-hooks`
- **Cloud Database / Sync Target:** Convex (TypeScript-native schema & server-side endpoints)
- **AI Inference Engine:** `@google/genai` (Gemini API for `gemma-4-26b-a4b-it`)
- **Payments:** Paystack SDK (Kenyan currency, M-Pesa STK channel)
- **Testing Tools:** Vitest, Playwright (E2E), and `fake-indexeddb`

---

## 📂 Directory Structure

```
├── .env.local.example       # Example variables for API integrations
├── ARCHITECTURE.md          # Full SAD with Architectural Decision Records (ADRs)
├── convex/                  # Convex backend models, schemas, and queries
├── docs/                    # Performance notes, deployment runbooks, and audits
├── e2e/                     # Playwright integration and E2E offline test specs
├── src/
│   ├── app/                 # Next.js app routes, layouts, and PWA shell
│   │   ├── api/             # Vercel-hosted serverless routes
│   │   └── sw.ts            # Service worker cache configurations
│   ├── features/            # Context modules (product management, sales)
│   └── lib/
│       ├── ai/              # Gemma swappable client providers and adapter
│       ├── db/              # Dexie.js schemas and IndexedDB operations
│       ├── identity/        # Device app PIN lock and shop profiling
│       └── payments/        # Paystack Charge wrapper
├── tsconfig.json            # Strict TypeScript configuration
└── vitest.config.ts         # Vitest unit test configuration
```

---

## ⚙️ Getting Started & Local Setup

### 1. Prerequisites
- [Node.js](https://nodejs.org) (v18+)
- A Google AI Studio API key (for Gemma)
- A Paystack sandbox developer account (for M-Pesa STK push)
- A Convex developer account

### 2. Configure Environment Variables
Copy `.env.local.example` into a new file named `.env.local`:
```bash
cp .env.local.example .env.local
```
Fill in the credentials:
- `GEMINI_API_KEY`: Google AI Studio API key.
- `NEXT_PUBLIC_CONVEX_URL`: Convex database link (will generate in the next step).
- `PAYSTACK_SECRET_KEY` & `PAYSTACK_PUBLIC_KEY`: Test credentials from Paystack settings.

### 3. Initialize Convex
Run the local dev sync daemon to register schema configurations and generate Convex bindings:
```bash
npx convex dev
```
Copy the generated Convex URL into your `.env.local` file as `NEXT_PUBLIC_CONVEX_URL`.

### 4. Run the Dev Server
Start the local hot-reload server:
```bash
npm run dev
```
Open `http://localhost:3000` to interact with the app.

---

## 🚀 Deployment Guide

1. **Deploy the database:** Run `npx convex deploy` to push your Convex configurations to a production project. Copy the production URL from your Convex dashboard.
2. **Setup Vercel project:** Import the repository on Vercel. 
3. **Configure Environment Variables:** Add your API secrets (`GEMINI_API_KEY`, `PAYSTACK_SECRET_KEY`, `NEXT_PUBLIC_CONVEX_URL`, etc.) under Vercel's project settings.
4. **Deploy:** Vercel will automatically compile assets, build the Serwist service worker client, and host serverless api routes.
5. **Configure Webhook:** Copy the deployed Vercel domain and register it under Paystack Settings -> API Keys & Webhooks as:
   `https://<your-vercel-domain>/api/webhooks/paystack`

---

## 🧪 Testing & Verification

DukaPOS incorporates robust automated testing for both localized actions and full E2E scenarios.

### Unit Tests (Vitest)
Executes logic verification on IndexedDB queries, validation pipelines, and offline queues:
```bash
npm run test:unit
```

### End-to-End Tests (Playwright)
Validates UI transitions, localization toggles, payments, and offline operations:
```bash
# Install browsers if running for the first time
npx playwright install

# Run the test suites
npm run test:e2e
```

---

## 📊 Performance Metrics

Actual, reproducible performance numbers measured directly inside the project verification stages (see `docs/PERFORMANCE_NOTES.md`):

- **Local Barcode Lookups:** **1.75ms** average (150-product catalog), proving near-instant stock identification.
- **Product List Catalog Load:** **5.54ms** average.
- **Gemma 4 Vision Identification:** **2.1s - 3.3s** average per image payload.
- **Gemma 4 Stock Update text parsing:** **1.5s** average response time.
- **Offline Core Loop:** Playwright tests utilizing `context.setOffline(true)` verify **zero network fallback issues**, with all routes, assets, and catalog functions served entirely by the local service worker caching layer.

---

## 📄 License

This project is released under the **Attribution 4.0 International (CC BY 4.0)** license.
