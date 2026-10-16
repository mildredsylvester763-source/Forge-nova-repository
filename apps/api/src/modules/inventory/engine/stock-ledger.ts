// ============================================================================
// FILE: /apps/api/src/modules/inventory/engine/stock-ledger.ts
// ============================================================================

// Stock movements. Quantity never goes negative — the ledger refuses
// by name rather than inventing backorders.

export type Verdict<T> = { ok: true; value: T } | { ok: false; reason: string };

export interface StockMovementInput {
  qty: number;
  note?: string;
  at: string;
}

export interface MovementResult {
  newQty: number;
  totalMoved: number;
}

export function applyMovement(existingQty: number, movements: StockMovementInput[], qty: number): Verdict<MovementResult> {
  if (!Number.isInteger(qty) || qty === 0) return { ok: false, reason: 'stock-zero-quantity' };
  const newQty = existingQty + qty;
  if (newQty < 0) return { ok: false, reason: 'stock-negative-on-hand' };
  return {
    ok: true,
    value: { newQty, totalMoved: movements.reduce((s, m) => s + m.qty, 0) + qty },
  };
}
