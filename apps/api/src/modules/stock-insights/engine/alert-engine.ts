// ============================================================================
// FILE: /apps/api/src/modules/stock-insights/engine/alert-engine.ts
// ============================================================================
// Pure low-stock alert rules. The threshold mirrors the classic reorder point:
// daily demand times lead time plus safety stock. Zero-threshold items have
// no reorder parameters and are skipped, never guessed at.

export const MAX_ALERT_PARAM = 1000000;
export const MAX_ALERT_THRESHOLD = 10000000;

export type Verdict<T> = { ok: true; value: T } | { ok: false; reason: string };

export function validateAlertParam(raw: unknown, reason: string): Verdict<number> {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0) {
    return { ok: false, reason };
  }
  if (raw > MAX_ALERT_PARAM) {
    return { ok: false, reason };
  }
  return { ok: true, value: raw };
}

export function reorderThreshold(
  dailyDemand: unknown,
  leadTimeDays: unknown,
  safetyStock: unknown,
): Verdict<number> {
  const d = validateAlertParam(dailyDemand, 'alert-invalid-demand');
  if (!d.ok) {
    return d;
  }
  const l = validateAlertParam(leadTimeDays, 'alert-invalid-lead-time');
  if (!l.ok) {
    return l;
  }
  const s = validateAlertParam(safetyStock, 'alert-invalid-safety-stock');
  if (!s.ok) {
    return s;
  }
  const threshold = d.value * l.value + s.value;
  if (threshold > MAX_ALERT_THRESHOLD) {
    return { ok: false, reason: 'alert-threshold-too-large' };
  }
  return { ok: true, value: threshold };
}

// An item is low when a positive threshold is reached or breached. A stock-out
// at threshold zero is NOT alerted because no reorder parameters were set.
export function isLowStock(onHand: number, threshold: number): boolean {
  return threshold > 0 && onHand <= threshold;
}

export interface ScanInput {
  itemId: string;
  onHand: number;
  dailyDemand: number;
  leadTimeDays: number;
  safetyStock: number;
}

export interface ScanPlan {
  toAlert: Array<{ itemId: string; onHand: number; threshold: number }>;
  toResolveItemIds: string[];
  stillLowItemIds: string[];
  skippedItemIds: string[];
}

// The scan plan is computed on the full input before anything is persisted:
// new alerts, alerts to auto-resolve because stock recovered, alerts that are
// still low (kept, never duplicated) and items skipped for missing parameters.
export function planLowStockScan(items: ScanInput[], activeItemIds: string[]): ScanPlan {
  const plan: ScanPlan = {
    toAlert: [],
    toResolveItemIds: [],
    stillLowItemIds: [],
    skippedItemIds: [],
  };
  for (const item of items) {
    const verdict = reorderThreshold(item.dailyDemand, item.leadTimeDays, item.safetyStock);
    if (!verdict.ok || verdict.value <= 0) {
      plan.skippedItemIds.push(item.itemId);
      continue;
    }
    const low = isLowStock(item.onHand, verdict.value);
    const active = activeItemIds.indexOf(item.itemId) !== -1;
    if (low && active) {
      plan.stillLowItemIds.push(item.itemId);
    } else if (low && !active) {
      plan.toAlert.push({ itemId: item.itemId, onHand: item.onHand, threshold: verdict.value });
    } else if (!low && active) {
      plan.toResolveItemIds.push(item.itemId);
    }
  }
  return plan;
}
