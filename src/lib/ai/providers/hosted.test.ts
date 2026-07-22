import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Product } from "@/lib/db/schema";
import { AiIdentifyError, AiTextError } from "../types";
import { hostedProvider } from "./hosted";

const generateContentMock = vi.fn();

vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn().mockImplementation(function GoogleGenAI(this: {
    models: { generateContent: typeof generateContentMock };
  }) {
    this.models = { generateContent: generateContentMock };
  }),
  createUserContent: vi.fn((parts: unknown) => ({ role: "user", parts })),
  createPartFromBase64: vi.fn((data: string, mimeType: string) => ({
    inlineData: { data, mimeType },
  })),
  Type: { OBJECT: "OBJECT", STRING: "STRING", NUMBER: "NUMBER", ARRAY: "ARRAY" },
}));

describe("hostedProvider.identifyProduct", () => {
  beforeEach(() => {
    generateContentMock.mockReset();
    process.env.GEMINI_API_KEY = "test-key";
  });

  it("normalizes a well-formed Gemma response into a ProductGuess", async () => {
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({ name: "Sugar 1kg", category: "Groceries", estimatedPriceKES: 150 }),
    });

    const guess = await hostedProvider.identifyProduct(new Uint8Array([1, 2, 3]), "image/jpeg");

    expect(guess).toEqual({ name: "Sugar 1kg", category: "Groceries", estimatedPriceKES: 150 });
  });

  it("throws AiIdentifyError when the response text is not valid JSON", async () => {
    generateContentMock.mockResolvedValue({ text: "not json at all" });

    await expect(
      hostedProvider.identifyProduct(new Uint8Array([1]), "image/jpeg"),
    ).rejects.toBeInstanceOf(AiIdentifyError);
  });

  it("strips a markdown code fence around the JSON before parsing (observed live, despite responseMimeType: application/json)", async () => {
    generateContentMock.mockResolvedValue({
      text: '```json\n{"name": "Sugar 1kg", "category": "Groceries", "estimatedPriceKES": 150}\n```',
    });

    const guess = await hostedProvider.identifyProduct(new Uint8Array([1]), "image/jpeg");

    expect(guess).toEqual({ name: "Sugar 1kg", category: "Groceries", estimatedPriceKES: 150 });
  });

  it("throws AiIdentifyError when required fields are missing from otherwise-valid JSON", async () => {
    generateContentMock.mockResolvedValue({ text: JSON.stringify({ name: "Sugar 1kg" }) });

    await expect(
      hostedProvider.identifyProduct(new Uint8Array([1]), "image/jpeg"),
    ).rejects.toBeInstanceOf(AiIdentifyError);
  });

  it("throws AiIdentifyError when GEMINI_API_KEY is not configured", async () => {
    delete process.env.GEMINI_API_KEY;

    await expect(
      hostedProvider.identifyProduct(new Uint8Array([1]), "image/jpeg"),
    ).rejects.toBeInstanceOf(AiIdentifyError);
    expect(generateContentMock).not.toHaveBeenCalled();
  });
});

describe("hostedProvider.parseStockUpdate", () => {
  const sugar: Product = {
    id: "product-1",
    name: "Sugar 1kg",
    category: "Groceries",
    priceKES: 150,
    stockQty: 20,
    source: "manual",
  };

  beforeEach(() => {
    generateContentMock.mockReset();
    process.env.GEMINI_API_KEY = "test-key";
  });

  it("normalizes a well-formed function-call-style response into StockUpdate[]", async () => {
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({
        updates: [
          {
            matchedProductId: "product-1",
            productNameGuess: "Sugar 1kg",
            quantityDelta: 3,
            direction: "decrease",
          },
        ],
      }),
    });

    const updates = await hostedProvider.parseStockUpdate("sold 3 sugar", [sugar]);

    expect(updates).toEqual([
      { productId: "product-1", productNameGuess: "Sugar 1kg", quantityDelta: 3, direction: "decrease" },
    ]);
  });

  it("returns an entry with no productId and a populated productNameGuess when nothing matched", async () => {
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({
        updates: [
          {
            matchedProductId: null,
            productNameGuess: "phone chargers",
            quantityDelta: 3,
            direction: "decrease",
          },
        ],
      }),
    });

    const updates = await hostedProvider.parseStockUpdate("sold 3 phone chargers", [sugar]);

    expect(updates).toEqual([
      { productNameGuess: "phone chargers", quantityDelta: 3, direction: "decrease" },
    ]);
    expect(updates[0].productId).toBeUndefined();
  });

  it("omits quantityDelta (not zero) when the model reports it as null", async () => {
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({
        updates: [
          {
            matchedProductId: "product-1",
            productNameGuess: "Sugar 1kg",
            quantityDelta: null,
            direction: "increase",
          },
        ],
      }),
    });

    const updates = await hostedProvider.parseStockUpdate("added more sugar", [sugar]);

    expect(updates[0].quantityDelta).toBeUndefined();
  });

  it("throws AiTextError when the response is missing the updates array", async () => {
    generateContentMock.mockResolvedValue({ text: JSON.stringify({ notUpdates: [] }) });

    await expect(hostedProvider.parseStockUpdate("sold 3 sugar", [sugar])).rejects.toBeInstanceOf(
      AiTextError,
    );
  });
});

describe("hostedProvider.generateSummary", () => {
  beforeEach(() => {
    generateContentMock.mockReset();
    process.env.GEMINI_API_KEY = "test-key";
  });

  it("returns the model's text for a day with transactions", async () => {
    generateContentMock.mockResolvedValue({
      text: "You made KES 450 today, mostly from Sugar 1kg.",
    });

    const summary = await hostedProvider.generateSummary({
      locale: "en",
      transactions: [
        {
          id: "t1",
          productId: "product-1",
          productName: "Sugar 1kg",
          quantity: 3,
          totalKES: 450,
          paymentMethod: "cash",
          status: "completed",
          createdAt: Date.now(),
          saleGroupId: "sale-1",
        },
      ],
    });

    expect(summary).toBe("You made KES 450 today, mostly from Sugar 1kg.");
    expect(generateContentMock).toHaveBeenCalledTimes(1);
  });

  it("returns a sensible message for zero transactions without calling the model", async () => {
    const summary = await hostedProvider.generateSummary({ locale: "en", transactions: [] });

    expect(summary.length).toBeGreaterThan(0);
    expect(generateContentMock).not.toHaveBeenCalled();
  });
});
