import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiIdentifyError } from "../types";
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
  Type: { OBJECT: "OBJECT", STRING: "STRING", NUMBER: "NUMBER" },
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
