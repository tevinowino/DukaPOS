# Kaggle Submission Details

- **Title**: DukaPOS: Offline-First AI Inventory & POS for Kenyan Merchants
- **Subtitle (One-sentence description)**: An offline-first PWA for Kenyan dukas using Gemma 4 to parse bilingual stock updates and identify unbarcoded goods via photos.
- **Submission Track**: Best Small Biz / Fintech Niche (Small Business & FinTech)
- **Project Links**:
  - GitHub Repository: https://github.com/tevinowino/DukaPOS
- **Evaluation Expectations**: Please note that most hackathons will not provide individualized feedback on submissions. Due to the volume of entries, it is not feasible for judges to offer detailed, personalized critiques to every participant. Thank you for submitting and good luck!

---

# Project Description

## 1. Abstract & Problem Statement
In Nairobi's retail ecosystem, many informal merchants, kiosks, and small shop owners (known locally as dukas) conduct their day-to-day business without digital inventory tools. Supermarket-grade Point-of-Sale (POS) systems are inadequate for these merchants as they assume barcoded inventory, stable internet connectivity, and staff trained on complex software. Consequently, sales records, stock tracking, and pricing stay in the shopkeeper's head or a paper notebook, leading to shrinkage, inaccurate restocks, and poor business visibility.

DukaPOS provides a lightweight, offline-first Progressive Web App (PWA) customized for Kenyan micro-retailers. By leveraging the advanced text and vision capabilities of the open-weights Gemma model (specifically `gemma-4-26b-a4b-it`), DukaPOS translates messy, natural language stock updates (in English, Swahili, or a mix of both) and product photos into strict, schema-compliant JSON payloads. These payloads immediately update a local IndexedDB database which synchronizes to a cloud store (Convex) whenever connectivity is restored, enabling merchants to manage both barcoded and unbarcoded goods effortlessly.

## 2. Technical Architecture & Implementation
This solution utilizes a local-first, service-worker-backed architecture optimized for cost-effective deployment on low-resource mobile smartphones:

- **Offline-First PWA & Service Worker:** The application is built using Next.js (App Router) and Serwist (`@serwist/next`), which caches the app shell and static resources, enabling the core workflows (adding products, recording sales, viewing stock) to function entirely offline.
- **Local-First Database & Reactivity:** All reads and writes are managed locally in IndexedDB using Dexie.js. Local reactive updates are managed via `useLiveQuery` from `dexie-react-hooks` to ensure immediate UI feedback.
- **AI Model Integration (Hosted & Self-Hosted Provider Adapter):** The AI adapter layer (`lib/ai/`) uses a swappable provider interface. By default, it calls the Google AI Studio Gemini API utilizing `gemma-4-26b-a4b-it` (instruction-tuned model). An environment variable switch (`AI_PROVIDER=selfhosted`) swaps it to a self-hosted FastAPI GPU endpoint (e.g., RunPod-hosted) without any application-wide code changes.
- **Kenyan Payments & Mobile Money:** Integrated with Paystack API to trigger M-Pesa STK push checkouts. Pending transactions are tracked locally while the client polls the transaction status route `/api/checkout/status` to match incoming Paystack webhook confirmations.
- **Background Sync Queue:** Operations performed offline (such as product additions and sales logging) are logged in a local `SyncQueue` and automatically drained to Convex via a serverless POST endpoint `/api/sync` once the device reconnects.

Data Transformation Pipeline Overview:
1. **Input:** The shopkeeper inputs raw text (e.g., "ongeza 5 packets of fresh milk na upunguze bread (white) na mbili") or captures a product photo.
2. **Processing Ingestion:** Next.js serverless API routes wrap the prompt instructions and schema constraints, querying the active Gemma model.
3. **Structured Inference:** The Gemma model performs zero-shot sequence extraction to map unstructured terms to existing product IDs or output normalized product records.
4. **Output Integration:** The valid JSON response is validated against the application schema and returned to the UI for user verification and correction before being committed to IndexedDB and sync queues.

## 3. Verification & System Performance
To demonstrate the execution loop, the system performance and data transformation paths are verified as follows:

- **Near-Instant Local Queries:** Local database performance measured against a catalog of 150 products yielded:
  - Barcode Query: average **1.75ms** (min: 0.42ms, max: 8.07ms)
  - Catalog Load (`listProducts`): average **5.54ms** (min: 3.21ms, max: 6.99ms)
- **Gemma-Powered Vision & Text Latency:** 
  - Vision Product Identification: average **2.1s–3.3s** (within the PRD 2–6s target).
  - Stock Update Parsing: average **1.5s**.
  - EOD Sales Summaries: **10.6s (English) / 22.6s (Swahili)** (reverts to instant local fallback strings if no sales occurred).
- **Playwright E2E Offline Verification:** Offline behavior verified via `context.setOffline(true)` and Playwright test suites. The core loop (view stock → add product → record cash sale) completed with **zero** non-service-worker network requests, confirming correct cache-shell delivery.
- **Graceful Error Handling:** If the Gemma model or network is unreachable during an AI task, the UI falls back gracefully to a descriptive error banner instead of crashing.

Data Transformation Walkthroughs:

Step A: Raw Conversational Input Parsing
"sold 3 sugar and added 5 packets of fresh milk"

Step B: Model-Generated Output Payload (StockUpdate Schema)
{
  "updates": [
    {
      "matchedProductId": "sugar-uuid-123",
      "productNameGuess": "Sugar 1kg",
      "quantityDelta": 3,
      "direction": "decrease"
    },
    {
      "matchedProductId": "milk-uuid-456",
      "productNameGuess": "fresh milk",
      "quantityDelta": 5,
      "direction": "increase"
    }
  ]
}

---

Step A: Unbarcoded Product Photo Identification
[Binary photo upload of a packet of cooking flour]

Step B: Model-Generated Output Payload (ProductGuess Schema)
{
  "name": "Maize Flour 2kg",
  "category": "Groceries",
  "estimatedPriceKES": 180
}

Author
Tevin Owino

Competition Prize Track
Small Business & FinTech

License
This Writeup has been released under the Attribution 4.0 International (CC BY 4.0) license.
