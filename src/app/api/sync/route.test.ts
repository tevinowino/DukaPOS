// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMutationMock = vi.fn();

vi.mock("convex/nextjs", () => ({
  fetchMutation: (...args: unknown[]) => fetchMutationMock(...args),
}));

vi.mock("@convex/_generated/api", () => ({
  api: {
    products: { upsertProduct: "products.upsertProduct" },
    transactions: { upsertTransaction: "transactions.upsertTransaction" },
  },
}));

describe("POST /api/sync", () => {
  beforeEach(() => {
    fetchMutationMock.mockReset();
    fetchMutationMock.mockResolvedValue(undefined);
  });

  it("syncs a product entry and a transaction entry to their matching Convex mutations", async () => {
    const { POST } = await import("./route");

    const product = {
      id: "product-1",
      name: "Sugar 1kg",
      category: "Groceries",
      priceKES: 150,
      stockQty: 20,
      source: "manual" as const,
    };
    const transaction = {
      id: "txn-1",
      productId: "product-1",
      productName: "Sugar 1kg",
      quantity: 2,
      totalKES: 300,
      paymentMethod: "cash" as const,
      status: "completed" as const,
      createdAt: 1700000000000,
      saleGroupId: "sale-1",
    };

    const request = new Request("http://localhost/api/sync", {
      method: "POST",
      body: JSON.stringify({
        shopId: "shop-a",
        entries: [
          { id: "entry-1", type: "product", payload: product },
          { id: "entry-2", type: "transaction", payload: transaction },
        ],
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results).toEqual([
      { id: "entry-1", status: "synced" },
      { id: "entry-2", status: "synced" },
    ]);

    expect(fetchMutationMock).toHaveBeenCalledWith("products.upsertProduct", {
      shopId: "shop-a",
      localId: "product-1",
      name: "Sugar 1kg",
      category: "Groceries",
      barcode: undefined,
      priceKES: 150,
      stockQty: 20,
      source: "manual",
    });
    expect(fetchMutationMock).toHaveBeenCalledWith("transactions.upsertTransaction", {
      shopId: "shop-a",
      localId: "txn-1",
      productId: "product-1",
      productName: "Sugar 1kg",
      quantity: 2,
      totalKES: 300,
      paymentMethod: "cash",
      status: "completed",
      createdAt: 1700000000000,
      saleGroupId: "sale-1",
    });
  });

  it("skips an entry with an unrecognized type without calling any mutation", async () => {
    const { POST } = await import("./route");

    const request = new Request("http://localhost/api/sync", {
      method: "POST",
      body: JSON.stringify({
        shopId: "shop-a",
        entries: [{ id: "entry-1", type: "mystery", payload: {} }],
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results).toEqual([{ id: "entry-1", status: "skipped" }]);
    expect(fetchMutationMock).not.toHaveBeenCalled();
  });

  it("returns a 502 when the Convex mutation call fails", async () => {
    fetchMutationMock.mockRejectedValueOnce(new Error("Convex unreachable"));
    const { POST } = await import("./route");

    const request = new Request("http://localhost/api/sync", {
      method: "POST",
      body: JSON.stringify({
        shopId: "shop-a",
        entries: [
          {
            id: "entry-1",
            type: "product",
            payload: {
              id: "product-1",
              name: "Sugar 1kg",
              category: "Groceries",
              priceKES: 150,
              stockQty: 20,
              source: "manual",
            },
          },
        ],
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(502);
  });
});
