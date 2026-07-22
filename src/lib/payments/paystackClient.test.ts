import { beforeEach, describe, expect, it, vi } from "vitest";
import { PaystackChargeError, initiateMpesaCharge } from "./paystackClient";

describe("initiateMpesaCharge", () => {
  beforeEach(() => {
    process.env.PAYSTACK_SECRET_KEY = "sk_test_fake";
    vi.restoreAllMocks();
  });

  it("sends the phone with its + prefix intact, amount in subunits, a synthesized email, and provider mpesa", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: true,
        message: "Charge attempted",
        data: {
          reference: "abc",
          status: "pay_offline",
          display_text: "Please complete authorization process on your mobile phone",
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await initiateMpesaCharge({
      phone: "+254712345678",
      amountKES: 150,
      reference: "abc",
      shopId: "shop-1",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.paystack.co/charge",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer sk_test_fake",
          "Content-Type": "application/json",
        }),
      }),
    );
    const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sentBody).toEqual({
      email: "sale-shop-1@dukapos.app",
      // Verified live against Paystack's sandbox (see this phase's
      // overview.md): KES amounts are in subunits, same as NGN kobo —
      // 150 KES becomes "15000", not "150".
      amount: "15000",
      reference: "abc",
      // shopId travels in metadata since Paystack's webhook payload has
      // no concept of it otherwise — see the module doc comment.
      metadata: { shopId: "shop-1" },
      mobile_money: {
        // Verified live: Paystack rejects the no-"+" form with "Invalid
        // phone number format" — the "+" must stay.
        phone: "+254712345678",
        provider: "mpesa",
      },
    });
  });

  it("returns the reference, Paystack's own status string, and display text from a successful response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: true,
          message: "Charge attempted",
          data: { reference: "abc", status: "pay_offline", display_text: "Check your phone" },
        }),
      }),
    );

    const result = await initiateMpesaCharge({
      phone: "+254712345678",
      amountKES: 150,
      reference: "abc",
      shopId: "shop-1",
    });

    expect(result).toEqual({
      reference: "abc",
      paystackStatus: "pay_offline",
      displayText: "Check your phone",
    });
  });

  it("throws PaystackChargeError (not an unhandled rejection) on a non-2xx/error response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ status: false, message: "Invalid phone number format" }),
      }),
    );

    await expect(
      initiateMpesaCharge({
        phone: "not-a-real-phone",
        amountKES: 150,
        reference: "abc",
        shopId: "shop-1",
      }),
    ).rejects.toBeInstanceOf(PaystackChargeError);
  });

  it("throws PaystackChargeError when PAYSTACK_SECRET_KEY is not configured", async () => {
    delete process.env.PAYSTACK_SECRET_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      initiateMpesaCharge({
        phone: "+254712345678",
        amountKES: 150,
        reference: "abc",
        shopId: "shop-1",
      }),
    ).rejects.toBeInstanceOf(PaystackChargeError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
