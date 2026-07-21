import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../db/schema";
import { createShopProfile } from "../identity/shopIdentity";
import { drainQueue, enqueue } from "./queue";

describe("sync queue", () => {
  beforeEach(async () => {
    await db.syncQueue.clear();
    await db.shopProfile.clear();
    vi.restoreAllMocks();
  });

  it("drainQueue marks an entry synced after a successful /api/sync response", async () => {
    await createShopProfile({ shopName: "Duka", phone: "0712345678", pin: "1234" });
    await enqueue({ type: "product", payload: { id: "p1", name: "Sugar 1kg" } });
    const [queued] = await db.syncQueue.toArray();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ results: [{ id: queued.id, status: "synced" }] }),
      }),
    );

    const outcome = await drainQueue();

    expect(outcome).toBe("synced");
    const updated = await db.syncQueue.get(queued.id);
    expect(updated?.syncedAt).toEqual(expect.any(Number));
  });

  it("drainQueue leaves the entry unsynced when /api/sync responds with an error status", async () => {
    await createShopProfile({ shopName: "Duka", phone: "0712345678", pin: "1234" });
    await enqueue({ type: "product", payload: { id: "p1", name: "Sugar 1kg" } });
    const [queued] = await db.syncQueue.toArray();

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    const outcome = await drainQueue();

    expect(outcome).toBe("failed");
    const updated = await db.syncQueue.get(queued.id);
    expect(updated?.syncedAt).toBeUndefined();
  });

  it("does not send a second overlapping request when drainQueue is called again before the first resolves", async () => {
    await createShopProfile({ shopName: "Duka", phone: "0712345678", pin: "1234" });
    await enqueue({ type: "product", payload: { id: "p1", name: "Sugar 1kg" } });

    let resolveFetch: (value: unknown) => void = () => {};
    const delayedFetch = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal("fetch", delayedFetch);

    const firstCall = drainQueue();
    const secondCall = drainQueue();

    expect(await secondCall).toBe("already-in-progress");

    // firstCall's own earlier steps (reading Dexie, reading the shop
    // profile) are real async IndexedDB work — wait until it actually
    // reaches the network call before resolving the mock.
    await vi.waitFor(() => expect(delayedFetch).toHaveBeenCalledTimes(1));
    resolveFetch({ ok: true, json: async () => ({ results: [] }) });
    await firstCall;

    expect(delayedFetch).toHaveBeenCalledTimes(1);
  });
});
