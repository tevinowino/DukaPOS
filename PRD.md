# Product Requirements Document

**Product Name:** DukaPOS
**Track:** Small Business & FinTech
**Event:** Build with Gemma: GDG on Campus UoN
**Author:** Tevin Owino
**Date:** July 2026

---

## 1. Problem Statement

Most small shops (dukas, kiosks, informal traders) in Kenya lack access to POS systems. Supermarket-grade POS tools assume barcoded inventory, stable connectivity, and staff trained on complex software, none of which match how a small shopkeeper actually operates. As a result, stock tracking, sales records, and pricing stay in the shopkeeper's head or a paper notebook, making it hard to spot shrinkage, restock accurately, or understand what's actually selling.

## 2. Goal

Build a lightweight, offline-first Progressive Web App that lets a small shop owner track inventory and sales from their phone, with AI assistance (Gemma 4) handling the messy, real-world cases a rigid POS can't: unbarcoded goods, natural-language stock updates, and plain-language reporting. Optimized for Kenyan business owners: simple, fast, bilingual (English/Swahili), and usable with minimal training.

## 3. Target User

A small shop owner or single employee in Nairobi (or similar urban/peri-urban context) who:
- Sells a mix of branded (barcoded) and informal/loose (unbarcoded) goods
- Has a smartphone but not necessarily reliable or unlimited data
- Has limited time and patience for onboarding or complex software
- May be more comfortable in Swahili, English, or a mix of both

## 4. Scope

### In scope (MVP)
- Barcode scanning for branded goods
- Photo-based product identification (Gemma 4 vision) for unbarcoded goods
- Manual add/edit as universal fallback
- Sale recording with stock deduction
- Offline-first operation with background sync
- Text-based natural language stock updates and queries (Gemma 4 text)
- Auto-generated plain-language sales summaries
- M-Pesa payment collection via Paystack (STK push)
- English/Swahili UI, single-shop/single-user

### Out of scope (future work)
- Voice input
- Multi-staff roles/permissions
- Multi-shop/franchise management
- Analytics dashboards beyond basic summaries
- Receipt printing
- Supplier/purchase order management

## 5. Functional Requirements

### Inventory & Product Management
- Add product via barcode scan
- Add product via photo (Gemma 4 identifies name, category, estimated price; shopkeeper confirms/edits before saving)
- Manual add/edit
- View current stock levels
- Edit or delete a product

### Sales & Transactions
- Record a sale (scan/select item, deduct stock, log transaction)
- Support quantity adjustments
- Record payment method (cash or M-Pesa)
- M-Pesa sales held as "pending" until Paystack webhook confirms payment, then completed
- Daily transaction log

### Gemma 4-Powered Assistance
- Parse typed natural language stock updates into structured inventory changes (English/Swahili/mixed)
- Answer natural language stock queries ("what's running low")
- Generate a plain-language end-of-day summary

### Payments
- Trigger M-Pesa STK push via Paystack at checkout
- Webhook-based payment confirmation
- Sandbox/test mode for demo; live mode requires Paystack KYC (post-hackathon)

### Account & Access
- Phone number + PIN login
- Implemented as a local device app lock (PIN set/verified on-device, no server-side account or session) — see ARCHITECTURE.md ADR-2. Phone number is collected as shop profile info, not a login credential.

## 6. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Offline capability | Core loop (add product, record sale, view stock) fully functional with zero connectivity |
| Performance | Barcode lookups near-instant (local); Gemma 4 photo ID target 2-6s via hosted API |
| Reliability | No data loss on connectivity drop; graceful degradation if Gemma 4 or Paystack API is unreachable |
| Usability | One-handed phone use, large tap targets, icon-first navigation, minimal reading required |
| Security | API keys and Paystack secret key server-side only; webhook signature verification; PIN stored securely |
| Localization | Full English/Swahili UI toggle; Gemma 4 handles mixed-language free text natively |
| Installability | Installable PWA, works like a native app |

## 7. Technical Architecture

- **Frontend:** Next.js (App Router), PWA via service worker, `next-intl` for localization
- **Local storage:** IndexedDB (Dexie.js), local-first read/write
- **Sync backend:** lightweight API for background sync once online
- **AI:** Gemma 4 via Google AI Studio hosted API (photo ID + text parsing), server-side calls only
- **Payments:** Paystack API (M-Pesa STK push, sandbox mode for demo)
- **Hosting:** Vercel (frontend + API routes)

## 8. Success Metrics (for hackathon judging)

| Rubric Criterion | How this PRD addresses it |
|---|---|
| Gemma Integration (30%) | Two distinct, core Gemma 4 use cases: vision-based product ID, language-based parsing/summarization |
| Innovation & Impact (30%) | Solves a real, specific gap (unbarcoded informal goods, offline-first) for an underserved user group |
| Functionality (20%) | Offline-first design and graceful degradation ensure a working live demo |
| Presentation & Writeup (20%) | Clear scope boundaries and architecture make for a focused, well-explained writeup |

## 9. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Gemma 4 API latency during live demo | Test hosted endpoint ahead of time; show clear loading state |
| Time overrun on Paystack integration | Build after core loop + one Gemma 4 feature are working; treat as second-priority feature |
| Rushed/awkward Swahili translations | Have a native speaker review copy before final build, not machine-translate |
| Scope creep | Hold firmly to "In scope (MVP)" list above; anything else goes to Future Work |

## 10. Timeline (remaining ~4 days)

1. **Day 1-2:** Core loop, barcode scan, manual add, sale recording, offline storage
2. **Day 2-3:** Gemma 4 photo ID and text parsing/summary features
3. **Day 3:** Paystack M-Pesa integration (if on schedule)
4. **Day 4:** Swahili localization pass, UI polish, demo rehearsal, writeup