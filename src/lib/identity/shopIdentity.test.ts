import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../db/schema";
import { createShopProfile, getShopProfile, verifyPin } from "./shopIdentity";

describe("shopIdentity", () => {
  beforeEach(async () => {
    await db.shopProfile.clear();
  });

  it("createShopProfile persists a profile with a normalized phone and a valid shopId", async () => {
    const result = await createShopProfile({
      shopName: "Mama Njeri's Shop",
      phone: "0712345678",
      pin: "1234",
    });

    expect(result.ok).toBe(true);

    const profile = await getShopProfile();
    expect(profile?.shopName).toBe("Mama Njeri's Shop");
    expect(profile?.phoneE164).toBe("+254712345678");
    expect(profile?.shopId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("does not store the PIN in plaintext", async () => {
    await createShopProfile({ shopName: "Duka", phone: "0712345678", pin: "1234" });

    const profile = await getShopProfile();
    expect(profile?.pinHash).not.toBe("1234");
  });

  it("verifyPin returns true for the correct PIN after setup", async () => {
    await createShopProfile({ shopName: "Duka", phone: "0712345678", pin: "1234" });

    expect(await verifyPin("1234")).toBe(true);
  });

  it("verifyPin returns false for an incorrect PIN after setup", async () => {
    await createShopProfile({ shopName: "Duka", phone: "0712345678", pin: "1234" });

    expect(await verifyPin("0000")).toBe(false);
  });

  it("verifyPin returns false without throwing when no profile exists", async () => {
    await expect(verifyPin("1234")).resolves.toBe(false);
  });

  it("rejects an invalid phone number and persists nothing", async () => {
    const result = await createShopProfile({ shopName: "Duka", phone: "12345", pin: "1234" });

    expect(result.ok).toBe(false);
    expect(await getShopProfile()).toBeUndefined();
  });
});
