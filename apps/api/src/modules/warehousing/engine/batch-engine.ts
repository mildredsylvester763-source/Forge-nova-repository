// ============================================================================
// Pure batch and expiry engine. Follows what lot-controlled inventory
// tools ship for perishables (Zoho Inventory batch tracking, Sortly,
// FoodReady, pharmacy systems): batch codes per SKU, expiry dates, FEFO
// picking (first expired, first out) that splits allocations across
// batches, expired stock that is never picked, and disposal of what has
// gone past its date. Every refusal is named; picks are all or nothing.
// ============================================================================

export type Verdict<T> = { ok: true; value: T } | { ok: false; reason: string };

export const BATCH_CODE_MAX = 40;
export const BATCH_MAX_QTY = 1000000;
export const BATCH_MAX_LIFETIME_MS = 10 * 365 * 24 * 3600 * 1000;
export const BATCH_DAY_MS = 24 * 3600 * 1000;

export interface BatchLike {
  id: string;
  expiresAtMs: number;
  remainingQty: number;
}

export function validateBatchCode(code: unknown): Verdict<string> {
  if (typeof code !== 'string') return { ok: false, reason: 'batch-invalid-code' };
  const trimmed = code.trim();
  if (trimmed.length < 1 || trimmed.length > BATCH_CODE_MAX) return { ok: false, reason: 'batch-invalid-code' };
  return { ok: true, value: trimmed };
}

export function validateBatchQty(qty: unknown): Verdict<number> {
  if (typeof qty !== 'number' || !Number.isInteger(qty) || qty < 1 || qty > BATCH_MAX_QTY) {
    return { ok: false, reason: 'batch-invalid-qty' };
  }
  return { ok: true, value: qty };
}

export function validateExpiryWindow(days: unknown): Verdict<number> {
  if (typeof days !== 'number' || !Number.isInteger(days) || days < 1 || days > 365) {
    return { ok: false, reason: 'batch-invalid-window' };
  }
  return { ok: true, value: days };
}

export function validateExpiresAt(expiresAtMs: unknown, receivedAtMs: number): Verdict<number> {
  if (typeof expiresAtMs !== 'number' || !Number.isInteger(expiresAtMs)) {
    return { ok: false, reason: 'batch-invalid-expiry' };
  }
  if (expiresAtMs <= receivedAtMs) return { ok: false, reason: 'batch-expiry-in-past' };
  if (expiresAtMs > receivedAtMs + BATCH_MAX_LIFETIME_MS) return { ok: false, reason: 'batch-expiry-too-far' };
  return { ok: true, value: expiresAtMs };
}

export function isExpiredBatch(batch: BatchLike, nowMs: number): boolean {
  return batch.expiresAtMs <= nowMs;
}

export function isExpiringSoon(batch: BatchLike, nowMs: number, windowDays: number): boolean {
  return !isExpiredBatch(batch, nowMs) && batch.expiresAtMs <= nowMs + windowDays * BATCH_DAY_MS;
}

// Fresh stock ordered by earliest expiry first; ties keep the original
// order so allocation is always deterministic.
export function fefoOrder(batches: BatchLike[], nowMs: number): BatchLike[] {
  const fresh = batches.filter((b) => !isExpiredBatch(b, nowMs) && b.remainingQty > 0);
  return fresh
    .map((b, i) => ({ b, i }))
    .sort((x, y) => (x.b.expiresAtMs === y.b.expiresAtMs ? x.i - y.i : x.b.expiresAtMs - y.b.expiresAtMs))
    .map((x) => x.b);
}

export interface BatchAllocation {
  batchId: string;
  qty: number;
}

// FEFO pick across fresh batches. The allocation is all or nothing: if the
// fresh stock cannot cover the quantity, nothing is allocated.
export function planBatchPick(
  batches: BatchLike[],
  qty: unknown,
  nowMs: number,
): Verdict<BatchAllocation[]> {
  const q = validateBatchQty(qty);
  if (!q.ok) return q;
  const ordered = fefoOrder(batches, nowMs);
  let remaining = q.value;
  const allocation: BatchAllocation[] = [];
  for (const b of ordered) {
    if (remaining <= 0) break;
    const take = Math.min(b.remainingQty, remaining);
    if (take > 0) {
      allocation.push({ batchId: b.id, qty: take });
      remaining -= take;
    }
  }
  if (remaining > 0) return { ok: false, reason: 'batch-insufficient-stock' };
  return { ok: true, value: allocation };
}
