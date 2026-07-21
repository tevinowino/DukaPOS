export type NormalizePhoneResult =
  | { ok: true; value: string }
  | { ok: false; reason: string };

/**
 * Converts a Kenyan mobile number in any common local format (`0712...`,
 * `712...`, `+254712...`, with or without spaces/dashes) into canonical
 * E.164 (`+254712345678`). This is the one place that transform happens —
 * every module touching a phone number imports this rather than
 * re-implementing it (global-rules §4).
 */
export function normalizePhone(input: string): NormalizePhoneResult {
  const digits = input.replace(/\D/g, "");

  let national: string;
  if (digits.startsWith("254") && digits.length === 12) {
    national = digits.slice(3);
  } else if (digits.startsWith("0") && digits.length === 10) {
    national = digits.slice(1);
  } else if (digits.length === 9) {
    national = digits;
  } else {
    return { ok: false, reason: "Enter a valid Kenyan phone number" };
  }

  // Kenyan mobile numbers: 9 digits after the country code, starting with
  // 7 (Safaricom/Airtel/Telkom) or 1 (newer Safaricom ranges).
  if (!/^[17]\d{8}$/.test(national)) {
    return { ok: false, reason: "Enter a valid Kenyan phone number" };
  }

  return { ok: true, value: `+254${national}` };
}
