import type { Product, Transaction } from "@/lib/db/schema";

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

/**
 * One proposed change from a natural-language stock update, before the
 * shopkeeper confirms it. `productId` is set only when Gemma matched the
 * text to a specific existing product (passed in via `existingProducts`);
 * otherwise the confirm UI surfaces `productNameGuess` as an unmatched
 * line the shopkeeper can create or skip. `quantityDelta` is omitted
 * (not zero) when the input was ambiguous about the amount — the confirm
 * UI must require an explicit value before that line can be applied.
 */
export interface StockUpdate {
  productId?: string;
  productNameGuess: string;
  quantityDelta?: number;
  direction: "increase" | "decrease";
}

/** Input to `generateSummary` — the day's transactions plus the target output language (never assumed from context alone). */
export interface DaySummaryInput {
  transactions: Transaction[];
  /** BCP-47-ish locale tag matching the shopkeeper's current UI language, e.g. `"en"` or `"sw"`. */
  locale: string;
}

/** A generated end-of-day summary is just its plain-language text in this MVP — no structured breakdown is asked for. */
export type DaySummary = string;

/** Thrown by a provider when Gemma's response can't be turned into a `ProductGuess` — never an uncaught parse exception. */
export class AiIdentifyError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AiIdentifyError";
  }
}

/** Thrown by a provider when a natural-language stock update or summary request can't be fulfilled. */
export class AiTextError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AiTextError";
  }
}

/**
 * The interface every `lib/ai/providers/*` file implements. `gemmaClient.ts`
 * is the only file that imports a provider directly — see global-rules §2
 * and Phase 6's Phase Rules.
 */
export interface AiProvider {
  identifyProduct(imageBytes: Uint8Array, mimeType: string): Promise<ProductGuess>;
  parseStockUpdate(text: string, existingProducts: Product[]): Promise<StockUpdate[]>;
  generateSummary(input: DaySummaryInput): Promise<DaySummary>;
}
