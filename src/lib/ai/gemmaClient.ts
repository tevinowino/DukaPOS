import type { ProductGuess } from "./types";
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
