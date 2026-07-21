import Dexie, { type EntityTable } from "dexie";
import { describe, expect, it } from "vitest";
import { db, type Product, type ShopProfile, type Transaction } from "./schema";

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

describe("version(3) migration", () => {
  it("preserves existing version(2) transaction rows after indexing saleGroupId", async () => {
    const dbName = `DukaDB-migration-v3-test-${crypto.randomUUID()}`;

    class PreV3DB extends Dexie {
      transactions!: EntityTable<Transaction, "id">;
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
    const preV3 = new PreV3DB(dbName);
    await preV3.transactions.add({
      id: "legacy-txn-1",
      productId: "legacy-product-1",
      productName: "Legacy Product",
      quantity: 2,
      totalKES: 200,
      paymentMethod: "cash",
      status: "completed",
      createdAt: Date.now(),
      saleGroupId: "legacy-sale-1",
    });
    preV3.close();

    class UpgradedDB extends Dexie {
      transactions!: EntityTable<Transaction, "id">;
      constructor(name: string) {
        super(name);
        this.version(1).stores({
          products: "id, barcode, category",
          transactions: "id, productId, status, createdAt",
          syncQueue: "id, syncedAt",
        });
        this.version(2).stores({ shopProfile: "shopId" });
        this.version(3).stores({
          transactions: "id, productId, status, createdAt, saleGroupId",
        });
      }
    }
    const upgraded = new UpgradedDB(dbName);

    const rows = await upgraded.transactions.where("saleGroupId").equals("legacy-sale-1").toArray();
    expect(rows).toEqual([
      {
        id: "legacy-txn-1",
        productId: "legacy-product-1",
        productName: "Legacy Product",
        quantity: 2,
        totalKES: 200,
        paymentMethod: "cash",
        status: "completed",
        createdAt: rows[0]?.createdAt,
        saleGroupId: "legacy-sale-1",
      },
    ]);

    upgraded.close();
  });
});
