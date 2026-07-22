# Deployment Runbook

Follow this cold — it assumes no prior familiarity with this codebase. Total time: roughly 20–30 minutes if every dashboard is already accessible.

## 1. Prerequisites

- A GitHub account with this repository pushed to it (or forked).
- A [Vercel](https://vercel.com) account.
- A [Convex](https://convex.dev) account.
- A [Google AI Studio](https://aistudio.google.com) account (for `GEMINI_API_KEY`).
- A [Paystack](https://paystack.com) account, sandbox/test mode is sufficient for a demo.

## 2. Deploy Convex (do this before Vercel — Vercel needs the resulting URL)

1. Locally, from the repo root: `npx convex dev` — this logs you into Convex (opens a browser prompt), creates a new Convex project if one doesn't exist yet, and pushes `convex/schema.ts` + `convex/products.ts` + `convex/transactions.ts` to it. It also **regenerates `convex/_generated/**`** for real — this repo's checked-in `_generated` files are hand-written stand-ins (no live deployment existed while building this project), and running `npx convex dev` for the first time is expected to overwrite them; that's correct, not a bug.
2. Once satisfied it's working locally, run `npx convex deploy` to push to a production Convex deployment (separate from the `dev` one `npx convex dev` uses).
3. From the [Convex dashboard](https://dashboard.convex.dev), copy the **production** deployment's URL (Settings → URL & Deploy Key) — this is `NEXT_PUBLIC_CONVEX_URL`.
4. From the same Settings page, generate a **Deploy Key** — this is `CONVEX_DEPLOY_KEY` (only needed if Vercel's build step runs `npx convex deploy` itself; if you deployed manually in step 2, this can be left unset).

## 3. Get the Gemini API key

1. [Google AI Studio](https://aistudio.google.com/apikey) → Create API key.
2. This is `GEMINI_API_KEY`. Leave `AI_PROVIDER` unset (defaults to the hosted Gemini provider) — see `PROVIDER_SWITCHING.md` if self-hosting is required instead.

## 4. Get Paystack sandbox keys

1. [Paystack dashboard](https://dashboard.paystack.com) → Settings → API Keys & Webhooks.
2. Make sure you're in **Test Mode** (toggle, top of the dashboard) for a demo — copy the **Test Secret Key** (`sk_test_...`) as `PAYSTACK_SECRET_KEY` and the **Test Public Key** (`pk_test_...`) as `PAYSTACK_PUBLIC_KEY`. Never use a `sk_live_...` key for a demo deployment.

## 5. Create the Vercel project

1. [vercel.com/new](https://vercel.com/new) → import the GitHub repository.
2. Framework preset: Next.js (auto-detected). No build command changes needed — `npm run build` already runs `next build --webpack` (required by `@serwist/next`, see `ARCHITECTURE.md` §9 ADR-4; do not let Vercel default this to Turbopack).
3. Before the first deploy, add every environment variable from the table below (Vercel project → Settings → Environment Variables, applied to Production — and Preview if you want PR previews to work too).

| Variable | Value source |
|---|---|
| `NEXT_PUBLIC_CONVEX_URL` | Step 2.3 above |
| `CONVEX_DEPLOY_KEY` | Step 2.4 above (optional — only if Vercel's build should run `npx convex deploy`) |
| `GEMINI_API_KEY` | Step 3 above |
| `AI_PROVIDER` | Leave unset for the hosted Gemini provider |
| `SELFHOSTED_AI_URL` | Only if `AI_PROVIDER=selfhosted` — see `PROVIDER_SWITCHING.md` |
| `PAYSTACK_SECRET_KEY` | Step 4 above (`sk_test_...`) |
| `PAYSTACK_PUBLIC_KEY` | Step 4 above (`pk_test_...`) |

4. Deploy.

## 6. Point Paystack's webhook at the deployed URL

1. Paystack dashboard → Settings → API Keys & Webhooks → Webhook URL.
2. Set it to `https://<your-vercel-domain>/api/webhooks/paystack`.
3. Paystack signs every webhook with the same secret key from step 4 (`PAYSTACK_SECRET_KEY`), which `src/app/api/webhooks/paystack/route.ts` verifies via HMAC-SHA512 against the raw request body — no separate webhook secret to configure.

## 7. Post-deploy smoke test

Do this in order — each step depends on the previous one having worked:

1. Open the deployed URL. Confirm onboarding renders (shop name + phone form), not a crash/500 page.
2. Complete onboarding (any shop name, a valid-looking Kenyan phone, a 4-digit PIN twice).
3. Add one product manually (Stock → Add product → Add manually).
4. Open the [Convex dashboard](https://dashboard.convex.dev) → your production deployment → Data → `products` table. **Wait up to a few seconds, then refresh** — confirm the product you just added appears there. This is the single most important check: it proves the browser → `/api/sync` → Convex path is fully wired, which nothing in local development (no live deployment existed while building this) ever exercised end-to-end.
5. Record one cash sale (New sale → add the product → Confirm sale) and confirm the corresponding `transactions` row appears in Convex the same way.
6. Optional, if you want to verify M-Pesa end-to-end: attempt an M-Pesa sale with a real Kenyan phone number in Paystack test mode and confirm the STK push arrives, and that approving/declining it correctly flips the transaction's status (poll or check Convex directly) — Paystack's test-mode STK push behavior is documented at their sandbox testing guide.
7. Toggle to Swahili (the EN/SW switch above the shell) and confirm the UI relabels immediately.
8. DevTools → Network → Offline, click through Stock / New sale / Sales log — confirm no raw error screen (see `docs/PERFORMANCE_NOTES.md` and this project's Phase 9/10 `overview.md` files for the specific offline-caching behavior this depends on).

If step 4 doesn't show the product, check: `NEXT_PUBLIC_CONVEX_URL` is set correctly (a common mistake is copying the `dev` deployment's URL instead of the `deploy`d production one), and check the Vercel function logs for `/api/sync` for the exact error.
