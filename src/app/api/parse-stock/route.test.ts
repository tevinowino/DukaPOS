// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const parseStockUpdateMock = vi.fn();

vi.mock("@/lib/ai/gemmaClient", () => ({
  parseStockUpdate: (...args: unknown[]) => parseStockUpdateMock(...args),
}));

function buildRequest(body: unknown) {
  return new Request("http://localhost/api/parse-stock", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/parse-stock", () => {
  beforeEach(() => {
    parseStockUpdateMock.mockReset();
  });

  it("returns the parsed StockUpdate[] for valid text", async () => {
    parseStockUpdateMock.mockResolvedValue([
      { productId: "p1", productNameGuess: "Sugar 1kg", quantityDelta: 3, direction: "decrease" },
    ]);
    const { POST } = await import("./route");

    const response = await POST(buildRequest({ text: "sold 3 sugar", existingProducts: [] }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.updates).toEqual([
      { productId: "p1", productNameGuess: "Sugar 1kg", quantityDelta: 3, direction: "decrease" },
    ]);
  });

  it("returns a 4xx for empty text without calling gemmaClient", async () => {
    const { POST } = await import("./route");

    const response = await POST(buildRequest({ text: "   ", existingProducts: [] }));

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    expect(parseStockUpdateMock).not.toHaveBeenCalled();
  });
});
