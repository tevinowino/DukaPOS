# Provider Switching

DukaPOS's AI layer (`src/lib/ai/`) is built behind a provider adapter (`ARCHITECTURE.md` §4.3) specifically so judges or organizers who require self-hosting aren't locked into Google AI Studio.

## How to switch

Set two environment variables (Vercel project settings, or `.env.local` for local development) and redeploy — no code change required:

```
AI_PROVIDER=selfhosted
SELFHOSTED_AI_URL=https://your-runpod-or-fastapi-endpoint.example.com
```

Unset or any other value for `AI_PROVIDER` (including leaving it blank) uses the default `hosted` provider (Google AI Studio / Gemini, `gemma-4-26b-a4b-it`), which requires `GEMINI_API_KEY` instead.

`src/lib/ai/gemmaClient.ts` is the only place this switch is read:

```ts
function activeProvider() {
  return process.env.AI_PROVIDER === "selfhosted" ? selfhostedProvider : hostedProvider;
}
```

Every other file in the app calls `gemmaClient.ts`'s exported functions (`identifyProduct`, `parseStockUpdate`, `generateSummary`) — nothing else references either provider directly or has any awareness of which one is active.

## Honesty about the current state

**`src/lib/ai/providers/selfhosted.ts` is a stub, not a working self-hosted backend.** It exists to prove the adapter pattern genuinely isolates the switch to one env var — every one of its three functions immediately throws a clear "not implemented yet (would call `<url>`)" error rather than silently pretending to work. Setting `AI_PROVIDER=selfhosted` today makes every AI-dependent screen (photo product ID, stock-update parsing, daily summary) fail gracefully with that message — it does not connect to a real model.

Building the actual self-hosted backend (a FastAPI service running Gemma 4 on RunPod or similar, matching `hosted.ts`'s three function contracts and normalized return types in `src/lib/ai/types.ts`) was explicitly out of scope for this hackathon build. Anyone implementing it only needs to fill in `selfhosted.ts` — no other file needs to change.
