/**
 * Normalized Gemma 4 vision output for an unbarcoded product photo. Both
 * provider files (`providers/hosted.ts`, `providers/selfhosted.ts`)
 * normalize into this exact shape — no caller inspects a provider-specific
 * response. Never auto-saved: always shown to the shopkeeper to confirm or
 * edit first (PRD §9).
 */
export interface ProductGuess {
  name: string;
  category: string;
  /** Whole Kenyan Shillings — integer, the model's best guess, always editable before save. */
  estimatedPriceKES: number;
  /** 0–1, if the provider supplies one. Advisory only — not currently surfaced in the UI. */
  confidence?: number;
}

/** Thrown by a provider when Gemma's response can't be turned into a `ProductGuess` — never an uncaught parse exception. */
export class AiIdentifyError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AiIdentifyError";
  }
}

/**
 * The interface every `lib/ai/providers/*` file implements. `gemmaClient.ts`
 * is the only file that imports a provider directly — see global-rules §2
 * and this phase's Phase Rules.
 */
export interface AiProvider {
  identifyProduct(imageBytes: Uint8Array, mimeType: string): Promise<ProductGuess>;
}
