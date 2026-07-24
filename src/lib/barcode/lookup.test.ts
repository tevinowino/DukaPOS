import { beforeEach, describe, expect, it, vi } from "vitest";
import { lookupBarcode } from "./lookup";

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body } as Response;
}

describe("lookupBarcode", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the Open Food Facts match, title-cased, without ever calling UPCitemdb", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        code: "5449000000996",
        product: { product_name: "coca-cola", brands: "Coca-Cola", categories: "Colas, Beverages" },
        status: 1,
        status_verbose: "product found",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await lookupBarcode("5449000000996");

    expect(result).toEqual({ barcode: "5449000000996", name: "Coca-Cola", category: "Colas" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain("world.openfoodfacts.org");
  });

  it("falls through to UPCitemdb when Open Food Facts has no product for this barcode", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("openfoodfacts")) {
        return jsonResponse({ code: "00000000", status: 0, status_verbose: "no code or invalid code" });
      }
      return jsonResponse({
        code: "OK",
        total: 1,
        offset: 0,
        items: [{ title: "Diet Coke Soda Soft Drink, 12 fl oz, 12 Pack", brand: "Diet Coke", category: "Food, Beverages & Tobacco > Beverages > Soda" }],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await lookupBarcode("049000028911");

    expect(result).toEqual({
      barcode: "049000028911",
      name: "Diet Coke Soda Soft Drink, 12 fl oz, 12 Pack",
      category: "Soda",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns null when neither provider has the barcode", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("openfoodfacts")) {
        return jsonResponse({ code: "00000000", status: 0 });
      }
      return { ok: false, json: async () => ({ code: "INVALID_UPC", message: "Not a valid UPC code." }) } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    expect(await lookupBarcode("0000000000000")).toBeNull();
  });

  it("falls through to UPCitemdb when Open Food Facts is unreachable, rather than throwing", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("openfoodfacts")) {
        throw new Error("network down");
      }
      return jsonResponse({
        code: "OK",
        total: 1,
        offset: 0,
        items: [{ title: "Matchbox Safety Matches", category: "Household > Fire Starters" }],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await lookupBarcode("6009876543210");

    expect(result).toEqual({ barcode: "6009876543210", name: "Matchbox Safety Matches", category: "Fire Starters" });
  });
});
