import { AiIdentifyError, AiTextError, type AiProvider, type ProductGuess } from "../types";

/**
 * Fallback provider for organizers requiring self-hosting (ARCHITECTURE.md
 * §9). A minimal stub, not a real implementation — it exists to prove the
 * adapter pattern genuinely isolates the `hosted` ↔ `selfhosted` switch to
 * one env var, not to be feature-complete. Building the actual RunPod/
 * FastAPI backend is explicitly out of scope (Phase 6/7's Phase Rules).
 */
export const selfhostedProvider: AiProvider = {
  async identifyProduct(): Promise<ProductGuess> {
    const url = process.env.SELFHOSTED_AI_URL;
    if (!url) {
      throw new AiIdentifyError(
        "AI_PROVIDER=selfhosted but SELFHOSTED_AI_URL is not configured",
      );
    }
    throw new AiIdentifyError(
      `Self-hosted product identification is not implemented yet (would call ${url})`,
    );
  },

  async parseStockUpdate() {
    const url = process.env.SELFHOSTED_AI_URL;
    if (!url) {
      throw new AiTextError("AI_PROVIDER=selfhosted but SELFHOSTED_AI_URL is not configured");
    }
    throw new AiTextError(
      `Self-hosted stock-update parsing is not implemented yet (would call ${url})`,
    );
  },

  async generateSummary() {
    const url = process.env.SELFHOSTED_AI_URL;
    if (!url) {
      throw new AiTextError("AI_PROVIDER=selfhosted but SELFHOSTED_AI_URL is not configured");
    }
    throw new AiTextError(
      `Self-hosted summary generation is not implemented yet (would call ${url})`,
    );
  },
};
