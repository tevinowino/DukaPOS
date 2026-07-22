// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchQueryMock = vi.fn();

vi.mock("convex/nextjs", () => ({
  fetchQuery: (...args: unknown[]) => fetchQueryMock(...args),
}));
vi.mock("@convex/_generated/api", () => ({
  api: { transactions: { getByReference: "transactions.getByReference" } },
}));

describe("GET /api/checkout/status", () => {
  beforeEach(() => {
    fetchQueryMock.mockReset();
  });

  it("returns the current status for a known reference", async () => {
    fetchQueryMock.mockResolvedValue({ status: "completed" });
    const { GET } = await import("./route");

    const response = await GET(
      new Request("http://localhost/api/checkout/status?shopId=shop-1&reference=ref-abc"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("completed");
    expect(fetchQueryMock).toHaveBeenCalledWith("transactions.getByReference", {
      shopId: "shop-1",
      reference: "ref-abc",
    });
  });

  it("returns a clear not-found response for an unknown reference", async () => {
    fetchQueryMock.mockResolvedValue(null);
    const { GET } = await import("./route");

    const response = await GET(
      new Request("http://localhost/api/checkout/status?shopId=shop-1&reference=unknown-ref"),
    );

    expect(response.status).toBe(404);
  });

  it("returns a 4xx when shopId or reference query params are missing", async () => {
    const { GET } = await import("./route");

    const response = await GET(new Request("http://localhost/api/checkout/status?shopId=shop-1"));

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    expect(fetchQueryMock).not.toHaveBeenCalled();
  });
});
