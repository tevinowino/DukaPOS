import type { Product } from "@/lib/db/schema";
import type { DaySummary, DaySummaryInput, ProductGuess, StockUpdate } from "./types";
import { hostedProvider } from "./providers/hosted";
import { selfhostedProvider } from "./providers/selfhosted";

/**
 * The only file the rest of the app imports from `lib/ai/`. Selects the
 * active provider from `AI_PROVIDER` — switching providers is this one
 * env var, never a code change (ARCHITECTURE.md §4.3).
 */
function activeProvider() {
  return process.env.AI_PROVIDER === "selfhosted" ? selfhostedProvider : hostedProvider;
}

export function identifyProduct(imageBytes: Uint8Array, mimeType: string): Promise<ProductGuess> {
  return activeProvider().identifyProduct(imageBytes, mimeType);
}

export function parseStockUpdate(text: string, existingProducts: Product[]): Promise<StockUpdate[]> {
  return activeProvider().parseStockUpdate(text, existingProducts);
}

export function generateSummary(input: DaySummaryInput): Promise<DaySummary> {
  return activeProvider().generateSummary(input);
}
