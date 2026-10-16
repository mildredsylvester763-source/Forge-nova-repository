// ============================================================================
// FILE: /apps/api/src/modules/audit/engine/audit-diff.ts
// ============================================================================

// Field-level JSON diff for the audit trail. Identical snapshots are a
// named refusal — "no change" is not an audit event.

export type Verdict<T> = { ok: true; value: T } | { ok: false; reason: string };

export interface AuditChange {
  field: string;
  before: unknown;
  after: unknown;
  kind: 'set' | 'added' | 'removed';
}

export function diffJson(before: Record<string, unknown>, after: Record<string, unknown>): Verdict<{ changes: AuditChange[] }> {
  if (typeof before !== 'object' || before === null || Array.isArray(before)) {
    return { ok: false, reason: 'diff-non-object-before' };
  }
  if (typeof after !== 'object' || after === null || Array.isArray(after)) {
    return { ok: false, reason: 'diff-non-object-after' };
  }
  const changes: AuditChange[] = [];
  for (const key of Object.keys(before)) {
    if (!(key in after)) {
      changes.push({ field: key, before: before[key], after: null, kind: 'removed' });
      continue;
    }
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      changes.push({ field: key, before: before[key], after: after[key], kind: 'set' });
    }
  }
  for (const key of Object.keys(after)) {
    if (!(key in before)) {
      changes.push({ field: key, before: null, after: after[key], kind: 'added' });
    }
  }
  if (!changes.length) return { ok: false, reason: 'diff-same-values' };
  return { ok: true, value: { changes } };
}
