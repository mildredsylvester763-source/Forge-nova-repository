// ============================================================================
// FILE: /apps/api/src/modules/crm-activities/engine/next-action.ts
// ============================================================================

// Ranks outreach actions: overdue-first (10 points per day), capped
// value weighting, stale boost when untouched for 30+ days.

export type Verdict<T> = { ok: true; value: T } | { ok: false; reason: string };

export interface ActionCandidate {
  id: string;
  title: string;
  dueAt?: string | null;
  valueCents?: number;
  lastDoneAt?: string | null;
}

export interface RankedAction {
  id: string;
  daysOverdue: number;
  score: number;
}

export function rankNextActions(actions: ActionCandidate[], now: Date): Verdict<{ ranked: RankedAction[] }> {
  if (!Array.isArray(actions) || !actions.length) return { ok: false, reason: 'actions-empty' };
  const scored: RankedAction[] = actions.map((a) => {
    let daysOverdue = 0;
    if (a.dueAt) daysOverdue = Math.floor((now.getTime() - new Date(a.dueAt).getTime()) / 86400000);
    const value = a.valueCents ?? 0;
    const staleBoost = !a.lastDoneAt
      ? 0
      : Math.floor((now.getTime() - new Date(a.lastDoneAt).getTime()) / 86400000) > 30
        ? 1
        : 0;
    const score = daysOverdue * 10 + Math.min(100, Math.floor(value / 10000)) + staleBoost * 50;
    return { id: a.id, daysOverdue, score };
  });
  scored.sort((x, y) => y.score - x.score || (x.id < y.id ? -1 : 1));
  return { ok: true, value: { ranked: scored } };
}
