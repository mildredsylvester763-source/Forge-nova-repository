// ============================================================================
// FILE: /apps/api/src/modules/customer-statements/engine/statement.ts
// ============================================================================
// Pure receivables aging. Buckets: current (not yet due), 1-30, 31-60, 61-90
// and 90+ days overdue. The invariant that catches every aging bug: the sum
// of the buckets must equal the total outstanding, always. No clock, no DB.

export type StatementVerdict<T> = { ok: true; value: T } | { ok: false; reason: string };

export interface StatementInvoice {
  id: string;
  number: string;
  totalCents: number;
  status: string;
  dueAt?: Date | string | null;
}

export interface AgingBucket {
  label: 'current' | '1-30' | '31-60' | '61-90' | '90+';
  invoiceCount: number;
  totalCents: number;
}

const DAY_MS = 86_400_000;

export function daysOverdue(inv: StatementInvoice, now: Date): number | null {
  if (!inv.dueAt) return null;
  const due = new Date(inv.dueAt).getTime();
  if (Number.isNaN(due)) return null;
  return Math.floor((now.getTime() - due) / DAY_MS);
}

export function bucketFor(days: number | null): AgingBucket['label'] {
  if (days === null || days <= 0) return 'current';
  if (days <= 30) return '1-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return '90+';
}

export function composeStatement(
  invoices: StatementInvoice[],
  now: Date,
): StatementVerdict<{ buckets: AgingBucket[]; outstandingCents: number }> {
  const open = invoices.filter((i) => i.status === 'sent' || i.status === 'overdue');
  if (open.length === 0) {
    return { ok: false, reason: 'no outstanding invoices to report' };
  }
  const labels: AgingBucket['label'][] = ['current', '1-30', '31-60', '61-90', '90+'];
  const buckets: AgingBucket[] = labels.map((label) => ({ label, invoiceCount: 0, totalCents: 0 }));
  for (const inv of open) {
    const bucket = buckets[labels.indexOf(bucketFor(daysOverdue(inv, now)))];
    bucket.invoiceCount += 1;
    bucket.totalCents += inv.totalCents;
  }
  const outstanding = buckets.reduce((s, b) => s + b.totalCents, 0);
  return { ok: true, value: { buckets, outstandingCents: outstanding } };
}
