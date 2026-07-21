import Dexie, { type EntityTable } from "dexie";
import { describe, expect, it } from "vitest";
import { db, type Product, type ShopProfile } from "./schema";

describe("db singleton", () => {
  it("returns the same instance across imports", async () => {
    const { db: dbAgain } = await import("./schema");
    expect(dbAgain).toBe(db);
  });

  it("exposes the products, transactions, syncQueue, and shopProfile tables", () => {
    expect(db.products).toBeDefined();
    expect(db.transactions).toBeDefined();
    expect(db.syncQueue).toBeDefined();
    expect(db.shopProfile).toBeDefined();
  });
});

describe("version(2) migration", () => {
  it("preserves existing version(1) product rows and adds a usable shopProfile table", async () => {
    const dbName = `DukaDB-migration-test-${crypto.randomUUID()}`;

    class LegacyDB extends Dexie {
      products!: EntityTable<Product, "id">;
      constructor(name: string) {
        super(name);
        this.version(1).stores({
          products: "id, barcode, category",
          transactions: "id, productId, status, createdAt",
          syncQueue: "id, syncedAt",
        });
      }
    }
    const legacy = new LegacyDB(dbName);
    await legacy.products.add({
      id: "legacy-1",
      name: "Legacy Product",
      category: "Test",
      priceKES: 10,
      stockQty: 1,
      source: "manual",
    });
    legacy.close();

    class UpgradedDB extends Dexie {
      products!: EntityTable<Product, "id">;
      shopProfile!: EntityTable<ShopProfile, "shopId">;
      constructor(name: string) {
        super(name);
        this.version(1).stores({
          products: "id, barcode, category",
          transactions: "id, productId, status, createdAt",
          syncQueue: "id, syncedAt",
        });
        this.version(2).stores({ shopProfile: "shopId" });
      }
    }
    const upgraded = new UpgradedDB(dbName);

    expect(await upgraded.products.toArray()).toEqual([
      {
        id: "legacy-1",
        name: "Legacy Product",
        category: "Test",
        priceKES: 10,
        stockQty: 1,
        source: "manual",
      },
    ]);
    expect(await upgraded.shopProfile.toArray()).toEqual([]);

    upgraded.close();
  });
});
