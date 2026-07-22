import { GoogleGenAI, Type, createPartFromBase64, createUserContent } from "@google/genai";
import type { Product } from "@/lib/db/schema";
import {
  AiIdentifyError,
  AiTextError,
  type AiProvider,
  type DaySummary,
  type DaySummaryInput,
  type ProductGuess,
  type StockUpdate,
} from "../types";

/**
 * Verified live against `GET /v1beta/models` on a real API key (Phase 7 —
 * see its overview.md): this account/API version only exposes
 * `gemma-4-26b-a4b-it` and `gemma-4-31b-it` for `generateContent`.
 * `gemma-4-4b-it`/`gemma-4-12b-it` — the smaller ids the original
 * research (Phase 6) understood to be available — return a 404 NOT_FOUND
 * and don't exist for this key. Using the smaller of the two real options
 * for PRD §6's 2–6s latency target; `gemma-4-31b-it` is the fallback if
 * accuracy needs outweigh latency.
 */
const MODEL_ID = "gemma-4-26b-a4b-it";

function requireApiKey(ErrorClass: typeof AiIdentifyError | typeof AiTextError): string {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new ErrorClass("GEMINI_API_KEY is not configured");
  }
  return apiKey;
}

/**
 * Strips a ```json ... ``` (or bare ``` ... ```) fence around JSON if
 * present. Verified live (Phase 7's smoke test against a real API key):
 * despite `responseMimeType: "application/json"` supposedly constraining
 * output, the model was observed to still wrap — or partially wrap — its
 * JSON in a markdown code fence on some calls. Defensive only; a
 * fence-free response passes through unchanged.
 */
function stripJsonFence(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenceMatch ? fenceMatch[1] : trimmed;
}

// ---------------------------------------------------------------------------
// identifyProduct (Phase 6)
// ---------------------------------------------------------------------------

const PRODUCT_GUESS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING },
    category: { type: Type.STRING },
    estimatedPriceKES: { type: Type.NUMBER },
  },
  required: ["name", "category", "estimatedPriceKES"],
};

const IDENTIFY_PROMPT = [
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

// ---------------------------------------------------------------------------
// parseStockUpdate (Phase 7)
// ---------------------------------------------------------------------------

const STOCK_UPDATE_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    updates: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          matchedProductId: { type: Type.STRING, nullable: true },
          productNameGuess: { type: Type.STRING },
          quantityDelta: { type: Type.NUMBER, nullable: true },
          direction: { type: Type.STRING, format: "enum", enum: ["increase", "decrease"] },
        },
        required: ["productNameGuess", "direction"],
      },
    },
  },
  required: ["updates"],
};

function buildStockUpdatePrompt(text: string, existingProducts: Product[]): string {
  const inventoryList = existingProducts.length
    ? existingProducts.map((product) => `- id="${product.id}": ${product.name}`).join("\n")
    : "(no products in inventory yet)";

  return `You are helping a small shop owner (a "duka") in Kenya update their stock from a short message, which may be in English, Swahili, or a mix of both.

Current inventory (id and name):
${inventoryList}

Message: "${text}"

The message may mention more than one product — it is important that you include a SEPARATE entry in "updates" for EVERY distinct product mentioned; do not stop after the first one and do not omit any. Reply with strict JSON matching:
{"updates": [{"matchedProductId": string | null, "productNameGuess": string, "quantityDelta": number | null, "direction": "increase" | "decrease"}]}

Rules:
- "matchedProductId" must be one of the inventory ids above if the message clearly refers to that product, or null if it doesn't match any existing product (still set "productNameGuess" to what the message called it).
- "quantityDelta" is the amount mentioned; use null if the message doesn't state a specific number (e.g. "added more sugar").
- "direction" is "increase" for stock added/received/restocked, and "decrease" for stock sold/removed/used.`;
}

function normalizeStockUpdates(value: unknown): StockUpdate[] {
  if (
    typeof value !== "object" ||
    value === null ||
    !Array.isArray((value as Record<string, unknown>).updates)
  ) {
    throw new AiTextError('Gemma response was missing the expected "updates" array');
  }

  const updates = (value as { updates: unknown[] }).updates;
  return updates.map((entry, index) => {
    if (typeof entry !== "object" || entry === null) {
      throw new AiTextError(`Gemma response's updates[${index}] was not an object`);
    }
    const record = entry as Record<string, unknown>;
    if (
      typeof record.productNameGuess !== "string" ||
      (record.direction !== "increase" && record.direction !== "decrease")
    ) {
      throw new AiTextError(`Gemma response's updates[${index}] was missing required fields`);
    }

    const update: StockUpdate = {
      productNameGuess: record.productNameGuess,
      direction: record.direction,
    };
    if (typeof record.matchedProductId === "string") {
      update.productId = record.matchedProductId;
    }
    if (typeof record.quantityDelta === "number") {
      update.quantityDelta = record.quantityDelta;
    }
    return update;
  });
}

// ---------------------------------------------------------------------------
// generateSummary (Phase 7)
// ---------------------------------------------------------------------------

/**
 * A day with zero transactions short-circuits without calling Gemma at
 * all — deliberately, not just as an optimization: asking a model to
 * "summarize" an empty transaction list risks a hallucinated summary,
 * and this canned message is faster, works offline, and is guaranteed
 * accurate. See this phase's overview.md for the full reasoning.
 */
const NO_SALES_MESSAGES: Record<string, string> = {
  en: "No sales were recorded today.",
  sw: "Hakuna mauzo yaliyorekodiwa leo.",
};

function buildSummaryPrompt(input: DaySummaryInput): string {
  const languageName = input.locale === "sw" ? "Swahili" : "English";
  const lines = input.transactions.map(
    (transaction) =>
      `- ${transaction.productName} x${transaction.quantity}, KES ${transaction.totalKES}, ${transaction.paymentMethod}`,
  );
  const totalKES = input.transactions.reduce((sum, transaction) => sum + transaction.totalKES, 0);

  return `You are summarizing a Kenyan small shop's sales for the day for the shop owner. Here are today's transactions:
${lines.join("\n")}

Total sales: KES ${totalKES}

Write a short (2-4 sentence) plain-language summary in ${languageName} covering the total sales, the best-selling item, and any notable pattern. Reply with only the summary paragraph — no JSON, no markdown, no headings.`;
}

/**
 * Calls Gemma 4 via Google AI Studio's hosted API (`@google/genai`) and
 * normalizes each response into this project's `lib/ai/types.ts` shapes.
 * Never called directly by anything outside `gemmaClient.ts` (global-rules
 * §2, Phase 6's Phase Rules).
 */
export const hostedProvider: AiProvider = {
  async identifyProduct(imageBytes, mimeType) {
    const apiKey = requireApiKey(AiIdentifyError);
    const ai = new GoogleGenAI({ apiKey });
    const base64Data = Buffer.from(imageBytes).toString("base64");

    let response;
    try {
      response = await ai.models.generateContent({
        model: MODEL_ID,
        contents: createUserContent([createPartFromBase64(base64Data, mimeType), IDENTIFY_PROMPT]),
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
      parsed = JSON.parse(stripJsonFence(text));
    } catch (error) {
      throw new AiIdentifyError("Gemma response was not valid JSON", { cause: error });
    }

    return normalizeProductGuess(parsed);
  },

  async parseStockUpdate(text, existingProducts) {
    const apiKey = requireApiKey(AiTextError);
    const ai = new GoogleGenAI({ apiKey });

    let response;
    try {
      response = await ai.models.generateContent({
        model: MODEL_ID,
        contents: buildStockUpdatePrompt(text, existingProducts),
        config: {
          responseMimeType: "application/json",
          responseSchema: STOCK_UPDATE_RESPONSE_SCHEMA,
        },
      });
    } catch (error) {
      throw new AiTextError("Gemma request failed", { cause: error });
    }

    const responseText = response.text;
    if (!responseText) {
      throw new AiTextError("Gemma returned an empty response");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripJsonFence(responseText));
    } catch (error) {
      throw new AiTextError("Gemma response was not valid JSON", { cause: error });
    }

    return normalizeStockUpdates(parsed);
  },

  async generateSummary(input): Promise<DaySummary> {
    if (input.transactions.length === 0) {
      return NO_SALES_MESSAGES[input.locale] ?? NO_SALES_MESSAGES.en;
    }

    const apiKey = requireApiKey(AiTextError);
    const ai = new GoogleGenAI({ apiKey });

    let response;
    try {
      response = await ai.models.generateContent({
        model: MODEL_ID,
        contents: buildSummaryPrompt(input),
      });
    } catch (error) {
      throw new AiTextError("Gemma request failed", { cause: error });
    }

    const text = response.text?.trim();
    if (!text) {
      throw new AiTextError("Gemma returned an empty response");
    }
    return text;
  },
};
