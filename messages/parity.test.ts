import { describe, expect, it } from "vitest";
import en from "./en.json";
import sw from "./sw.json";

/** Recursively collects dot-joined leaf paths so nested namespaces are compared, not just top-level keys. */
function flattenKeys(catalog: object, prefix = ""): string[] {
  return Object.entries(catalog).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "object" && value !== null ? flattenKeys(value, path) : [path];
  });
}

describe("message catalog parity", () => {
  it("en.json and sw.json define exactly the same set of keys", () => {
    const enKeys = flattenKeys(en).sort();
    const swKeys = flattenKeys(sw).sort();

    expect(swKeys).toEqual(enKeys);
  });
});
