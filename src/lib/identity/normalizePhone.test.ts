import { describe, expect, it } from "vitest";
import { normalizePhone } from "./normalizePhone";

describe("normalizePhone", () => {
  it("converts a leading-zero local number to E.164", () => {
    expect(normalizePhone("0712345678")).toEqual({ ok: true, value: "+254712345678" });
  });

  it("converts a bare 9-digit national number to E.164", () => {
    expect(normalizePhone("712345678")).toEqual({ ok: true, value: "+254712345678" });
  });

  it("is idempotent on an already-canonical E.164 number", () => {
    expect(normalizePhone("+254712345678")).toEqual({ ok: true, value: "+254712345678" });
  });

  it("strips spaces before converting", () => {
    expect(normalizePhone("0712 345 678")).toEqual({ ok: true, value: "+254712345678" });
  });

  it("rejects a number that's too short", () => {
    const result = normalizePhone("12345");
    expect(result.ok).toBe(false);
  });

  it("rejects an empty string", () => {
    const result = normalizePhone("");
    expect(result.ok).toBe(false);
  });
});
