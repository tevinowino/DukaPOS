// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiIdentifyError } from "@/lib/ai/types";

const identifyProductMock = vi.fn();

vi.mock("@/lib/ai/gemmaClient", () => ({
  identifyProduct: (...args: unknown[]) => identifyProductMock(...args),
}));

function buildImageRequest(image: Blob) {
  const formData = new FormData();
  formData.append("image", image, "photo.jpg");
  return new Request("http://localhost/api/identify-product", {
    method: "POST",
    body: formData,
  });
}

describe("POST /api/identify-product", () => {
  beforeEach(() => {
    identifyProductMock.mockReset();
  });

  it("returns a 200 with the ProductGuess for a valid image payload", async () => {
    identifyProductMock.mockResolvedValue({
      name: "Sugar 1kg",
      category: "Groceries",
      estimatedPriceKES: 150,
    });
    const { POST } = await import("./route");

    const image = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });
    const response = await POST(buildImageRequest(image));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ name: "Sugar 1kg", category: "Groceries", estimatedPriceKES: 150 });
    expect(identifyProductMock).toHaveBeenCalledTimes(1);
  });

  it("returns a 4xx for an unsupported mime type without calling gemmaClient", async () => {
    const { POST } = await import("./route");

    const image = new Blob([new Uint8Array([1, 2, 3])], { type: "application/pdf" });
    const response = await POST(buildImageRequest(image));

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    expect(identifyProductMock).not.toHaveBeenCalled();
  });

  it("returns a 4xx for an oversized image without calling gemmaClient", async () => {
    const { POST } = await import("./route");

    const oversized = new Uint8Array(6 * 1024 * 1024);
    const image = new Blob([oversized], { type: "image/jpeg" });
    const response = await POST(buildImageRequest(image));

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    expect(identifyProductMock).not.toHaveBeenCalled();
  });

  it("maps a gemmaClient rejection to a typed error response, not a raw 500", async () => {
    identifyProductMock.mockRejectedValue(new AiIdentifyError("GEMINI_API_KEY is not configured"));
    const { POST } = await import("./route");

    const image = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });
    const response = await POST(buildImageRequest(image));
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error).toBe("GEMINI_API_KEY is not configured");
  });
});
