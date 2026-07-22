// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchQueryMock = vi.fn();
const fetchMutationMock = vi.fn();
const initiateMpesaChargeMock = vi.fn();

vi.mock("convex/nextjs", () => ({
  fetchQuery: (...args: unknown[]) => fetchQueryMock(...args),
  fetchMutation: (...args: unknown[]) => fetchMutationMock(...args),
}));
vi.mock("@convex/_generated/api", () => ({
  api: {
    products: { listByShop: "products.listByShop" },
    transactions: { markPending: "transactions.markPending" },
  },
}));
vi.mock("@/lib/payments/paystackClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/payments/paystackClient")>();
  return {
    ...actual,
    initiateMpesaCharge: (...args: unknown[]) => initiateMpesaChargeMock(...args),
  };
});

function buildRequest(body: unknown) {
  return new Request("http://localhost/api/checkout", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const SYNCED_PRODUCT = {
  localId: "product-1",
  name: "Sugar 1kg",
  category: "Groceries",
  priceKES: 150,
  stockQty: 20,
  source: "manual" as const,
};

describe("POST /api/checkout", () => {
  beforeEach(() => {
    fetchQueryMock.mockReset();
    fetchMutationMock.mockReset();
    initiateMpesaChargeMock.mockReset();
  });

  it("computes totalKES from Convex's synced product data, ignoring any price the request body claims", async () => {
    fetchQueryMock.mockResolvedValue([SYNCED_PRODUCT]);
    initiateMpesaChargeMock.mockResolvedValue({
      reference: "generated-ref",
      paystackStatus: "pay_offline",
      displayText: "Check your phone",
    });
    fetchMutationMock.mockResolvedValue(undefined);

    const response = await (
      await import("./route")
    ).POST(
      buildRequest({
        shopId: "shop-1",
        productId: "product-1",
        quantity: 2,
        phone: "+254712345678",
        // A deliberately wrong client-side price — the route has no field
        // for this in its own type, but confirm it's ignored even if sent.
        totalKES: 1,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    // The route generates its own reference (crypto.randomUUID()) rather
    // than trusting Paystack's echoed one — just confirm one is present.
    expect(typeof body.reference).toBe("string");
    expect(body.reference.length).toBeGreaterThan(0);
    // 150 KES/unit * 2 = 300, not the client-claimed 1.
    expect(initiateMpesaChargeMock).toHaveBeenCalledWith(
      expect.objectContaining({ amountKES: 300, shopId: "shop-1" }),
    );
    expect(fetchMutationMock).toHaveBeenCalledWith(
      "transactions.markPending",
      expect.objectContaining({ totalKES: 300, quantity: 2 }),
    );
  });

  it("returns a sync-before-charging error and never calls paystackClient when the product hasn't synced to Convex", async () => {
    fetchQueryMock.mockResolvedValue([]); // product not found for this shop

    const response = await (
      await import("./route")
    ).POST(
      buildRequest({
        shopId: "shop-1",
        productId: "not-synced-product",
        quantity: 1,
        phone: "+254712345678",
      }),
    );

    expect(response.status).toBe(409);
    expect(initiateMpesaChargeMock).not.toHaveBeenCalled();
    expect(fetchMutationMock).not.toHaveBeenCalled();
  });
});
