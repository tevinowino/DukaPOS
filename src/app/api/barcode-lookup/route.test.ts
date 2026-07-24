// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const lookupBarcodeMock = vi.fn();

vi.mock("@/lib/barcode/lookup", () => ({
  lookupBarcode: (...args: unknown[]) => lookupBarcodeMock(...args),
}));

function buildRequest(code: string | null) {
  const url = new URL("http://localhost/api/barcode-lookup");
  if (code !== null) {
    url.searchParams.set("code", code);
  }
  return new Request(url);
}

describe("GET /api/barcode-lookup", () => {
  beforeEach(() => {
    lookupBarcodeMock.mockReset();
  });

  it("returns found:true with the normalized product for a barcode a provider recognizes", async () => {
    lookupBarcodeMock.mockResolvedValue({ barcode: "5449000000996", name: "Coca-Cola", category: "Colas" });
    const { GET } = await import("./route");

    const response = await GET(buildRequest("5449000000996"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ found: true, barcode: "5449000000996", name: "Coca-Cola", category: "Colas" });
    expect(lookupBarcodeMock).toHaveBeenCalledWith("5449000000996");
  });

  it("returns found:false with a 200 (not an error) when no provider has a match", async () => {
    lookupBarcodeMock.mockResolvedValue(null);
    const { GET } = await import("./route");

    const response = await GET(buildRequest("0000000000000"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ found: false });
  });

  it("returns a 400 without calling the lookup when the code param is missing", async () => {
    const { GET } = await import("./route");

    const response = await GET(buildRequest(null));

    expect(response.status).toBe(400);
    expect(lookupBarcodeMock).not.toHaveBeenCalled();
  });

  it("returns a 400 without calling the lookup for a code containing invalid characters", async () => {
    const { GET } = await import("./route");

    const response = await GET(buildRequest("<script>alert(1)</script>"));

    expect(response.status).toBe(400);
    expect(lookupBarcodeMock).not.toHaveBeenCalled();
  });
});
