// ============================================================================
// FILE: /apps/api/src/modules/agent/engine/assistant-text.ts
// ============================================================================

// Meeting notes become action items; questions get answers. Extraction
// only recognizes explicit action verbs — it never turns small talk into
// work. FAQ matching refuses below 50% token overlap. Owners are single
// @tokens; due dates are explicit "due N days" phrases.

export type Verdict<T> = { ok: true; value: T } | { ok: false; reason: string };

export interface MeetingAction {
  title: string;
  owner?: string;
  dueInDays?: number;
}

export interface FaqEntry {
  q: string;
  a: string;
}

export interface FaqAnswer {
  a: string;
  matchedQ: string;
  score: number;
}

const ACTION_VERBS: string[] = ['call', 'email', 'send', 'follow up', 'review', 'pay', 'invoice', 'draft', 'book', 'schedule', 'check', 'confirm', 'chase'];
const OWNER_RE = /@\s*([A-Za-z][A-Za-z.'-]{0,20})/;
const DUE_RE = /\bdue\s+(?:in\s+)?(\d+)\s*(?:days?|d)\b/i;

export function extractActions(notes: string): Verdict<{ actions: MeetingAction[] }> {
  if (typeof notes !== 'string') return { ok: false, reason: 'actions-not-a-string' };
  const actions: MeetingAction[] = [];
  for (const rawLine of notes.split(/\n|;/)) {
    const line = rawLine.trim().replace(/^[-*•]\s*/, '');
    if (!line) continue;
    const lower = line.toLowerCase();
    const verb = ACTION_VERBS.find((v) => lower.startsWith(v));
    if (!verb) continue;
    const ownerM = line.match(OWNER_RE);
    const dueM = line.match(DUE_RE);
    let title = line.replace(OWNER_RE, '').replace(DUE_RE, '').replace(/\s{2,}/g, ' ').trim();
    if (!title) title = verb;
    actions.push({
      title,
      ...(ownerM ? { owner: ownerM[1].trim() } : {}),
      ...(dueM ? { dueInDays: parseInt(dueM[1], 10) } : {}),
    });
  }
  return { ok: true, value: { actions } };
}

export function tokenize(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((t) => t.length > 2);
}

export function answerFaq(question: string, faqs: FaqEntry[]): Verdict<FaqAnswer> {
  if (!faqs.length) return { ok: false, reason: 'faq-empty-library' };
  if (!question || !question.trim()) return { ok: false, reason: 'faq-empty-question' };
  const qTokens = new Set(tokenize(question));
  let best: FaqAnswer | null = null;
  for (const entry of faqs) {
    const tokens = tokenize(entry.q);
    let hits = 0;
    for (const t of tokens) if (qTokens.has(t)) hits += 1;
    const score = tokens.length ? hits / tokens.length : 0;
    if (!best || score > best.score) best = { a: entry.a, matchedQ: entry.q, score };
  }
  if (!best || best.score < 0.5) return { ok: false, reason: 'faq-no-match' };
  return { ok: true, value: best };
}
