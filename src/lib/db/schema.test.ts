import { describe, expect, it } from "vitest";
import { db } from "./schema";

describe("db singleton", () => {
  it("returns the same instance across imports", async () => {
    const { db: dbAgain } = await import("./schema");
    expect(dbAgain).toBe(db);
  });

  it("exposes the products, transactions, and syncQueue tables", () => {
    expect(db.products).toBeDefined();
    expect(db.transactions).toBeDefined();
    expect(db.syncQueue).toBeDefined();
  });
});
