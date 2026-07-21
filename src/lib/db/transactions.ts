import { db, type Transaction } from "./schema";
import { updateProduct } from "./products";
import { enqueue } from "../sync/queue";

export interface SaleLineItem {
  productId: string;
  quantity: number;
}

/**
 * Decrements a product's `stockQty` by `quantity`, clamped at zero — never
 * negative. The single place stock is ever decremented for a completed
 * sale; Phase 8's M-Pesa webhook-completion path mirrors this exact
 * clamp-at-zero logic in a Convex mutation (it cannot import this
 * Dexie-bound function, since Convex functions run server-side with no
 * access to the browser's IndexedDB — see Phase 5's overview.md).
 * No-ops if the product no longer exists. Goes through `updateProduct`
 * (not a raw `db.products.update`) so the stock change also gets enqueued
 * for sync, same as any other product edit.
 */
export async function deductStock(productId: string, quantity: number): Promise<void> {
  const product = await db.products.get(productId);
  if (!product) {
    return;
  }
  await updateProduct(productId, { stockQty: Math.max(0, product.stockQty - quantity) });
}

/**
 * Records a cash sale of one or more products as one deep entry point —
 * every line is deducted and logged together, sharing one `saleGroupId`
 * and `createdAt`. Products that no longer exist are skipped defensively
 * (the sell UI only ever offers existing products, so this shouldn't
 * happen in practice).
 */
export async function recordCashSale(items: SaleLineItem[]): Promise<Transaction[]> {
  const saleGroupId = crypto.randomUUID();
  const createdAt = Date.now();
  const recorded: Transaction[] = [];

  for (const item of items) {
    const product = await db.products.get(item.productId);
    if (!product) {
      continue;
    }

    await deductStock(item.productId, item.quantity);

    const transaction: Transaction = {
      id: crypto.randomUUID(),
      productId: item.productId,
      productName: product.name,
      quantity: item.quantity,
      totalKES: product.priceKES * item.quantity,
      paymentMethod: "cash",
      status: "completed",
      createdAt,
      saleGroupId,
    };
    await db.transactions.add(transaction);
    await enqueue({ type: "transaction", payload: transaction });
    recorded.push(transaction);
  }

  return recorded;
}

export interface ListTransactionsOptions {
  /** Defaults to today (local time) if omitted. */
  date?: Date;
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Lists every transaction recorded on the given (local) day, defaulting to today. */
export async function listTransactions(options: ListTransactionsOptions = {}): Promise<Transaction[]> {
  const dayStart = startOfDay(options.date ?? new Date());
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;
  return db.transactions.where("createdAt").between(dayStart, dayEnd, true, false).toArray();
}

export interface SaleGroup {
  saleGroupId: string;
  createdAt: number;
  totalKES: number;
  lines: Transaction[];
}

/** Groups a flat list of `Transaction` rows by `saleGroupId`, newest first — pure presentation logic, no I/O. */
export function groupTransactionsBySale(transactions: Transaction[]): SaleGroup[] {
  const groups = new Map<string, SaleGroup>();

  for (const transaction of transactions) {
    const existing = groups.get(transaction.saleGroupId);
    if (existing) {
      existing.lines.push(transaction);
      existing.totalKES += transaction.totalKES;
    } else {
      groups.set(transaction.saleGroupId, {
        saleGroupId: transaction.saleGroupId,
        createdAt: transaction.createdAt,
        totalKES: transaction.totalKES,
        lines: [transaction],
      });
    }
  }

  return Array.from(groups.values()).sort((a, b) => b.createdAt - a.createdAt);
}
