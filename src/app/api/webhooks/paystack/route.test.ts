// @vitest-environment node
import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const markCompletedMock = vi.fn();

vi.mock("convex/nextjs", () => ({
  fetchMutation: (...args: unknown[]) => markCompletedMock(...args),
}));
vi.mock("@convex/_generated/api", () => ({
  api: { transactions: { markCompleted: "transactions.markCompleted" } },
}));

const TEST_SECRET = "sk_test_fake_secret";

function computeSignature(rawBody: string, secret: string): string {
  return createHmac("sha512", secret).update(rawBody).digest("hex");
}

function buildRequest(rawBody: string, signature: string | null) {
  const headers = new Headers();
  if (signature !== null) {
    headers.set("x-paystack-signature", signature);
  }
  return new Request("http://localhost/api/webhooks/paystack", {
    method: "POST",
    headers,
    body: rawBody,
  });
}

describe("POST /api/webhooks/paystack", () => {
  beforeEach(() => {
    markCompletedMock.mockReset();
    process.env.PAYSTACK_SECRET_KEY = TEST_SECRET;
  });

  it("calls markCompleted with the shopId and reference for a validly-signed charge.success event", async () => {
    const { POST } = await import("./route");
    const rawBody = JSON.stringify({
      event: "charge.success",
      data: { reference: "ref-abc", metadata: { shopId: "shop-1" } },
    });
    const signature = computeSignature(rawBody, TEST_SECRET);

    const response = await POST(buildRequest(rawBody, signature));

    expect(response.status).toBe(200);
    expect(markCompletedMock).toHaveBeenCalledWith("transactions.markCompleted", {
      shopId: "shop-1",
      reference: "ref-abc",
    });
  });

  it("rejects a request with an invalid signature and never calls markCompleted", async () => {
    const { POST } = await import("./route");
    const rawBody = JSON.stringify({
      event: "charge.success",
      data: { reference: "ref-abc", metadata: { shopId: "shop-1" } },
    });

    const response = await POST(buildRequest(rawBody, "not-a-real-signature"));

    expect(response.status).toBe(401);
    expect(markCompletedMock).not.toHaveBeenCalled();
  });

  it("rejects a request with no signature header at all", async () => {
    const { POST } = await import("./route");
    const rawBody = JSON.stringify({ event: "charge.success", data: { reference: "ref-abc" } });

    const response = await POST(buildRequest(rawBody, null));

    expect(response.status).toBe(401);
    expect(markCompletedMock).not.toHaveBeenCalled();
  });

  it("ignores a validly-signed event that isn't charge.success, without calling markCompleted", async () => {
    const { POST } = await import("./route");
    const rawBody = JSON.stringify({
      event: "charge.failed",
      data: { reference: "ref-abc", metadata: { shopId: "shop-1" } },
    });
    const signature = computeSignature(rawBody, TEST_SECRET);

    const response = await POST(buildRequest(rawBody, signature));

    expect(response.status).toBe(200);
    expect(markCompletedMock).not.toHaveBeenCalled();
  });

  it("verifies against the exact raw body, not a JSON-reserialized version (the documented gotcha)", async () => {
    const { POST } = await import("./route");
    // Deliberately unusual formatting (extra whitespace) so
    // JSON.stringify(JSON.parse(rawBody)) produces different bytes than
    // rawBody itself.
    const rawBody =
      '{"event":"charge.success",   "data":{"reference":"ref-abc","metadata":{"shopId":"shop-1"}}}';
    const reserialized = JSON.stringify(JSON.parse(rawBody));
    // Sanity checks that this test actually exercises the gotcha.
    expect(reserialized).not.toBe(rawBody);
    expect(computeSignature(rawBody, TEST_SECRET)).not.toBe(
      computeSignature(reserialized, TEST_SECRET),
    );

    const response = await POST(buildRequest(rawBody, computeSignature(rawBody, TEST_SECRET)));

    expect(response.status).toBe(200);
    expect(markCompletedMock).toHaveBeenCalledWith("transactions.markCompleted", {
      shopId: "shop-1",
      reference: "ref-abc",
    });
  });
});
