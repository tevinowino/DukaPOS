import { db, type Transaction } from "./schema";
import { applyStockDelta } from "./products";
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
 * access to the browser's IndexedDB — see Phase 5's overview.md). The
 * clamp itself lives in `products.ts`'s `applyStockDelta` — this is a
 * thin, sale-specific wrapper (negative delta, and no-op instead of throw
 * if the product no longer exists, since a sale's own product-existence
 * check already happens in `recordCashSale`).
 */
export async function deductStock(productId: string, quantity: number): Promise<void> {
  try {
    await applyStockDelta(productId, -quantity);
  } catch {
    // Product no longer exists — deductStock's contract is to no-op, not throw.
  }
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

export interface DailyRevenue {
  /** Local midnight for this bucket. */
  date: Date;
  totalKES: number;
}

/**
 * Sums completed-sale revenue per local day for the last `days` days
 * (oldest first, today last) — one range query over the whole window,
 * bucketed in memory, rather than one query per day. Powers the Sales
 * dashboard's mini revenue chart.
 */
export async function getRecentDailyRevenue(
  days: number,
  referenceDate: Date = new Date(),
): Promise<DailyRevenue[]> {
  const today = startOfDay(referenceDate);
  const windowStart = today - (days - 1) * 24 * 60 * 60 * 1000;
  const windowEnd = today + 24 * 60 * 60 * 1000;

  const transactions = await db.transactions
    .where("createdAt")
    .between(windowStart, windowEnd, true, false)
    .toArray();

  const buckets: DailyRevenue[] = Array.from({ length: days }, (_, i) => ({
    date: new Date(windowStart + i * 24 * 60 * 60 * 1000),
    totalKES: 0,
  }));

  for (const transaction of transactions) {
    const bucketIndex = Math.floor((startOfDay(new Date(transaction.createdAt)) - windowStart) / (24 * 60 * 60 * 1000));
    if (bucketIndex >= 0 && bucketIndex < days) {
      buckets[bucketIndex].totalKES += transaction.totalKES;
    }
  }

  return buckets;
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

export interface PaymentMethodTotal {
  totalKES: number;
  count: number;
}

export interface PaymentBreakdown {
  cash: PaymentMethodTotal;
  mpesa: PaymentMethodTotal;
  totalKES: number;
}

/**
 * Sums completed-sale revenue by `paymentMethod` — pure presentation logic,
 * no I/O. Pending and failed transactions (M-Pesa sales still awaiting the
 * Paystack webhook, or ones that never completed) are excluded, matching
 * every other revenue figure in this file (`getRecentDailyRevenue`,
 * `recordCashSale`'s own totals).
 */
export function getPaymentBreakdown(transactions: Transaction[]): PaymentBreakdown {
  const breakdown: PaymentBreakdown = {
    cash: { totalKES: 0, count: 0 },
    mpesa: { totalKES: 0, count: 0 },
    totalKES: 0,
  };

  for (const transaction of transactions) {
    if (transaction.status !== "completed") {
      continue;
    }
    breakdown[transaction.paymentMethod].totalKES += transaction.totalKES;
    breakdown[transaction.paymentMethod].count += 1;
    breakdown.totalKES += transaction.totalKES;
  }

  return breakdown;
}

export interface TopMover {
  productName: string;
  quantity: number;
}

/**
 * The product with the highest total quantity sold across the given
 * transactions — pure presentation logic, no I/O. `null` for an empty
 * list, never a zero-quantity placeholder. Ties break on whichever
 * product name sorts first, for deterministic output.
 */
export function getTopMover(transactions: Transaction[]): TopMover | null {
  const totals = new Map<string, number>();
  for (const transaction of transactions) {
    totals.set(transaction.productName, (totals.get(transaction.productName) ?? 0) + transaction.quantity);
  }
  if (totals.size === 0) {
    return null;
  }
  const [productName, quantity] = Array.from(totals.entries()).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )[0];
  return { productName, quantity };
}
