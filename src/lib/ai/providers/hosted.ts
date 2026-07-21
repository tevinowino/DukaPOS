import { GoogleGenAI, Type, createPartFromBase64, createUserContent } from "@google/genai";
import { AiIdentifyError, type AiProvider, type ProductGuess } from "../types";

/**
 * Smallest/fastest hosted Gemma 4 model — chosen for PRD §6's 2–6s photo-ID
 * latency target. Not empirically benchmarked against the other sizes in
 * this environment (no `GEMINI_API_KEY` available — see this phase's
 * overview.md); re-confirm this is the right tradeoff once a real key is
 * available; `gemma-4-12b-it`/`gemma-4-26b-a4b-it`/`gemma-4-31b-it` are the
 * other confirmed-available hosted ids if accuracy needs outweigh latency.
 */
const MODEL_ID = "gemma-4-4b-it";

const PRODUCT_GUESS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING },
    category: { type: Type.STRING },
    estimatedPriceKES: { type: Type.NUMBER },
  },
  required: ["name", "category", "estimatedPriceKES"],
};

const PROMPT = [
  "You are helping a small shop owner (a 'duka') in Kenya catalog an",
  "unbarcoded product from a photo. Identify the product shown and reply",
  "with strict JSON matching this shape: {\"name\": string, \"category\":",
  "string, \"estimatedPriceKES\": number}. `name` should be a short,",
  "specific product name (e.g. \"Cooking Oil 1L\", not just \"Oil\").",
  "`category` should be a short grocery/retail category (e.g.",
  "\"Groceries\", \"Household\", \"Bakery\"). `estimatedPriceKES` should be",
  "your best-guess retail price in whole Kenyan Shillings for this item in",
  "a Kenyan small shop — a rough estimate is fine, the shopkeeper will",
  "correct it. If you cannot identify the product with reasonable",
  "confidence, still return your best guess rather than refusing.",
].join(" ");

/**
 * Calls Gemma 4 via Google AI Studio's hosted API (`@google/genai`) and
 * normalizes the response into a `ProductGuess`. Never called directly by
 * anything outside `gemmaClient.ts` (global-rules §2, this phase's Phase
 * Rules).
 */
export const hostedProvider: AiProvider = {
  async identifyProduct(imageBytes, mimeType) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new AiIdentifyError("GEMINI_API_KEY is not configured");
    }

    const ai = new GoogleGenAI({ apiKey });
    const base64Data = Buffer.from(imageBytes).toString("base64");

    let response;
    try {
      response = await ai.models.generateContent({
        model: MODEL_ID,
        contents: createUserContent([createPartFromBase64(base64Data, mimeType), PROMPT]),
        config: {
          responseMimeType: "application/json",
          responseSchema: PRODUCT_GUESS_SCHEMA,
        },
      });
    } catch (error) {
      throw new AiIdentifyError("Gemma request failed", { cause: error });
    }

    const text = response.text;
    if (!text) {
      throw new AiIdentifyError("Gemma returned an empty response");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw new AiIdentifyError("Gemma response was not valid JSON", { cause: error });
    }

    return normalizeProductGuess(parsed);
  },
};

function normalizeProductGuess(value: unknown): ProductGuess {
  if (typeof value !== "object" || value === null) {
    throw new AiIdentifyError("Gemma response was not a JSON object");
  }

  const record = value as Record<string, unknown>;
  if (
    typeof record.name !== "string" ||
    typeof record.category !== "string" ||
    typeof record.estimatedPriceKES !== "number"
  ) {
    throw new AiIdentifyError("Gemma response was missing required ProductGuess fields");
  }

  const guess: ProductGuess = {
    name: record.name,
    category: record.category,
    estimatedPriceKES: Math.max(0, Math.round(record.estimatedPriceKES)),
  };
  if (typeof record.confidence === "number") {
    guess.confidence = record.confidence;
  }
  return guess;
}
