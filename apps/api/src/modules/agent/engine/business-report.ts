// ============================================================================
// FILE: /apps/api/src/modules/agent/engine/business-report.ts
// ============================================================================

// Two report engines. weeklyReport nets collections against expenses and
// emits machine-readable alerts. cashflowForecast buckets open invoices
// by due date across the horizon and layers recurring monthly costs into
// every window; bucket sums always equal the reported totals.

export type Verdict<T> = { ok: true; value: T } | { ok: false; reason: string };

export interface WeeklyReportInputs {
  invoicedCents: number;
  collectedCents: number;
  expensesCents: number;
  overdueCount: number;
}

export interface WeeklyReportValue {
  invoicedCents: number;
  collectedCents: number;
  expensesCents: number;
  netCents: number;
  alerts: string[];
}

export interface ForecastInvoice {
  totalCents: number;
  dueDate: string | null;
}

export interface RecurringCost {
  amountCents: number;
  dayOfMonth: number;
}

export interface ForecastBucket {
  index: number;
  fromDay: number;
  toDay: number;
  expectedInCents: number;
  expectedOutCents: number;
}

export interface ForecastValue {
  horizonDays: number;
  buckets: ForecastBucket[];
  totalInCents: number;
  totalOutCents: number;
}

export function weeklyReport(inputs: WeeklyReportInputs, _now: Date): Verdict<WeeklyReportValue> {
  for (const [field, amount] of Object.entries(inputs)) {
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
      return { ok: false, reason: `report-negative-input:${field}` };
    }
  }
  const alerts: string[] = [];
  if (inputs.overdueCount > 0) alerts.push(`overdue-invoices:${inputs.overdueCount}`);
  if (inputs.collectedCents < inputs.expensesCents) alerts.push('burn-exceeds-collections');
  if (inputs.invoicedCents > 0 && inputs.collectedCents < inputs.invoicedCents / 2) {
    alerts.push('collections-below-half-of-invoiced');
  }
  return {
    ok: true,
    value: {
      invoicedCents: inputs.invoicedCents,
      collectedCents: inputs.collectedCents,
      expensesCents: inputs.expensesCents,
      netCents: inputs.collectedCents - inputs.expensesCents,
      alerts,
    },
  };
}

export function cashflowForecast(
  invoices: ForecastInvoice[],
  recurring: RecurringCost[],
  now: Date,
  horizonDays: number,
): Verdict<ForecastValue> {
  if (!Number.isFinite(horizonDays) || horizonDays <= 0) {
    return { ok: false, reason: 'forecast-invalid-horizon' };
  }
  const bucketCount = Math.ceil(horizonDays / 30);
  const buckets: ForecastBucket[] = Array.from({ length: bucketCount }, (_, i) => ({
    index: i,
    fromDay: i * 30,
    toDay: Math.min((i + 1) * 30, horizonDays) - 1,
    expectedInCents: 0,
    expectedOutCents: 0,
  }));

  const bucketOf = (daysFromNow: number): number =>
    Math.min(bucketCount - 1, Math.floor(daysFromNow / 30));

  let totalInCents = 0;
  for (const invoice of invoices) {
    if (!invoice.dueDate) continue;
    const days = Math.round((new Date(invoice.dueDate).getTime() - now.getTime()) / 86400000);
    if (days < 0 || days >= horizonDays) continue;
    buckets[bucketOf(days)].expectedInCents += invoice.totalCents;
    totalInCents += invoice.totalCents;
  }

  let totalOutCents = 0;
  if (recurring.length) {
    const startMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const endMs = now.getTime() + horizonDays * 86400000;
    for (let offset = 0; offset <= bucketCount + 1; offset++) {
      const monthStart = new Date(startMonth.getTime());
      monthStart.setUTCMonth(monthStart.getUTCMonth() + offset);
      for (const cost of recurring) {
        if (cost.amountCents <= 0) continue;
        const day = Math.min(cost.dayOfMonth, 28);
        const occurrence = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), day));
        const ms = occurrence.getTime();
        if (ms <= now.getTime() || ms > endMs) continue;
        const days = Math.round((ms - now.getTime()) / 86400000);
        buckets[bucketOf(days)].expectedOutCents += cost.amountCents;
        totalOutCents += cost.amountCents;
      }
    }
  }

  return {
    ok: true,
    value: { horizonDays, buckets, totalInCents, totalOutCents },
  };
}
