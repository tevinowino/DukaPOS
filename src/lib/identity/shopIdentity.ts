import { db, type ShopProfile } from "../db/schema";
import { normalizePhone } from "./normalizePhone";

export interface CreateShopProfileInput {
  shopName: string;
  phone: string;
  pin: string;
}

export type CreateShopProfileResult =
  | { ok: true; profile: ShopProfile }
  | { ok: false; reason: string };

/**
 * Hashes a PIN with a random salt via Web Crypto's SHA-256 — sufficient for
 * this MVP's threat model (don't store a 4-digit PIN in cleartext on a
 * single local device), not intended to resist targeted offline cracking
 * of a 4-digit space. A dedicated password-hashing primitive (bcrypt/scrypt)
 * would be unnecessary weight for that threat model.
 */
async function hashPin(pin: string, salt: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${salt}:${pin}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Creates this device's one shop profile: normalizes the phone, generates
 * `shopId`, hashes the PIN, and persists it. Fails without writing anything
 * if the phone doesn't normalize to a plausible Kenyan mobile number.
 */
export async function createShopProfile(
  input: CreateShopProfileInput,
): Promise<CreateShopProfileResult> {
  const phoneResult = normalizePhone(input.phone);
  if (!phoneResult.ok) {
    return { ok: false, reason: phoneResult.reason };
  }

  const pinSalt = crypto.randomUUID();
  const pinHash = await hashPin(input.pin, pinSalt);
  const profile: ShopProfile = {
    shopId: crypto.randomUUID(),
    shopName: input.shopName,
    phoneE164: phoneResult.value,
    pinHash,
    pinSalt,
    createdAt: Date.now(),
  };

  await db.shopProfile.add(profile);
  return { ok: true, profile };
}

/** Returns this device's shop profile, or `undefined` before onboarding has run. */
export async function getShopProfile(): Promise<ShopProfile | undefined> {
  return db.shopProfile.toCollection().first();
}

/**
 * Verifies a PIN against the stored hash. Returns `false` (never throws)
 * if no profile exists yet — the calling UI shouldn't be reachable in that
 * state, but this function stays safe regardless.
 */
export async function verifyPin(pin: string): Promise<boolean> {
  const profile = await getShopProfile();
  if (!profile) {
    return false;
  }
  const candidate = await hashPin(pin, profile.pinSalt);
  return candidate === profile.pinHash;
}

/**
 * Replaces the stored PIN hash for the existing shop profile. No UI calls
 * this yet in this phase (no "change PIN" screen is in scope) — it exists
 * now so the identity module's interface is complete for later phases.
 * Returns `false` if no profile exists yet.
 */
export async function updatePin(newPin: string): Promise<boolean> {
  const profile = await getShopProfile();
  if (!profile) {
    return false;
  }
  const pinHash = await hashPin(newPin, profile.pinSalt);
  await db.shopProfile.update(profile.shopId, { pinHash });
  return true;
}
