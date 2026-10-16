// ============================================================================
// FILE: /apps/api/src/modules/inventory/engine/reorder.ts
// ============================================================================

// Reorder logic: reorder point = daily demand x lead time + safety stock.
// When on-hand drops to it, order back up to a lead-time-plus-30-day
// cover. Negative inputs are named refusals.

export type Verdict<T> = { ok: true; value: T } | { ok: false; reason: string };

export interface ReorderPlan {
  reorderPoint: number;
  reorderQty: number;
  reorderNow: boolean;
}

export function reorderPlan(onHand: number, dailyDemand: number, leadTimeDays: number, safetyStock: number): Verdict<ReorderPlan> {
  if (onHand < 0 || dailyDemand < 0 || leadTimeDays < 0 || safetyStock < 0) {
    return { ok: false, reason: 'reorder-negative-input' };
  }
  const reorderPoint = dailyDemand * leadTimeDays + safetyStock;
  const reorderNow = onHand <= reorderPoint;
  const target = dailyDemand * (leadTimeDays + 30) + safetyStock;
  const reorderQty = reorderNow ? Math.max(0, target - onHand) : 0;
  return { ok: true, value: { reorderPoint, reorderQty, reorderNow } };
}
