// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const generateSummaryMock = vi.fn();

vi.mock("@/lib/ai/gemmaClient", () => ({
  generateSummary: (...args: unknown[]) => generateSummaryMock(...args),
}));

function buildRequest(body: unknown) {
  return new Request("http://localhost/api/summary", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/summary", () => {
  beforeEach(() => {
    generateSummaryMock.mockReset();
  });

  it("returns summary text for a request with seeded transaction data", async () => {
    generateSummaryMock.mockResolvedValue("You made KES 450 today, mostly from Sugar 1kg.");
    const { POST } = await import("./route");

    const response = await POST(
      buildRequest({
        locale: "en",
        transactions: [
          {
            id: "t1",
            productId: "p1",
            productName: "Sugar 1kg",
            quantity: 3,
            totalKES: 450,
            paymentMethod: "cash",
            status: "completed",
            createdAt: Date.now(),
            saleGroupId: "sale-1",
          },
        ],
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.summary).toBe("You made KES 450 today, mostly from Sugar 1kg.");
  });

  it("returns a coherent message for an empty transaction list, not an error", async () => {
    generateSummaryMock.mockResolvedValue("No sales were recorded today.");
    const { POST } = await import("./route");

    const response = await POST(buildRequest({ locale: "en", transactions: [] }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.summary).toBe("No sales were recorded today.");
  });
});
