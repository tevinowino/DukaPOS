import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hostedIdentifyMock = vi.fn().mockResolvedValue({
  name: "hosted-guess",
  category: "Groceries",
  estimatedPriceKES: 100,
});
const selfhostedIdentifyMock = vi.fn().mockResolvedValue({
  name: "selfhosted-guess",
  category: "Groceries",
  estimatedPriceKES: 100,
});

vi.mock("./providers/hosted", () => ({
  hostedProvider: { identifyProduct: hostedIdentifyMock },
}));
vi.mock("./providers/selfhosted", () => ({
  selfhostedProvider: { identifyProduct: selfhostedIdentifyMock },
}));

describe("gemmaClient.identifyProduct", () => {
  const originalProvider = process.env.AI_PROVIDER;

  beforeEach(() => {
    hostedIdentifyMock.mockClear();
    selfhostedIdentifyMock.mockClear();
  });

  afterEach(() => {
    process.env.AI_PROVIDER = originalProvider;
  });

  it("routes to the hosted provider when AI_PROVIDER=hosted", async () => {
    process.env.AI_PROVIDER = "hosted";
    const { identifyProduct } = await import("./gemmaClient");

    await identifyProduct(new Uint8Array([1]), "image/jpeg");

    expect(hostedIdentifyMock).toHaveBeenCalledTimes(1);
    expect(selfhostedIdentifyMock).not.toHaveBeenCalled();
  });

  it("routes to the selfhosted provider when AI_PROVIDER=selfhosted", async () => {
    process.env.AI_PROVIDER = "selfhosted";
    const { identifyProduct } = await import("./gemmaClient");

    await identifyProduct(new Uint8Array([1]), "image/jpeg");

    expect(selfhostedIdentifyMock).toHaveBeenCalledTimes(1);
    expect(hostedIdentifyMock).not.toHaveBeenCalled();
  });
});
