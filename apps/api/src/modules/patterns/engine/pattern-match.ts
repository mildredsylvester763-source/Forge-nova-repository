// ============================================================================
// FILE: /apps/api/src/modules/patterns/engine/pattern-match.ts
// ============================================================================
// Pure relevance engine: given a new opportunity/product context (category,
// source, tags) and the user's pattern library, which past lessons apply?
// Same discipline as the scoring/decision/experiment engines: no DB, no
// clock, no network. Deterministic. Fail-visible: every match carries the
// reasons it matched, and a pattern with nothing in common is excluded —
// never padded into the results with a fake score of zero.
//
// Matching is about RELEVANCE, not valence: a FAILURE pattern matches just
// as strongly as a SUCCESS pattern — arguably it matters more, because it
// is a chance to not repeat a proven mistake.

export interface MatchablePattern {
  id: string;
  kind: 'success' | 'failure';
  title: string;
  category: string;
  source?: string | null;
  tags: string[];
  summary: string;
}

export interface MatchContext {
  category: string;
  source?: string | null;
  tags: string[];
}

export interface PatternMatch {
  patternId: string;
  kind: 'success' | 'failure';
  title: string;
  summary: string;
  // 0-100 relevance, never awarded without a concrete overlap.
  score: number;
  reasons: string[];
}

// Points per concrete overlap. Category is the strongest signal (the lesson
// was learned in the same arena); source next; tags refine. Weights have
// written reasons — no magic numbers.
const CATEGORY_MATCH_POINTS = 40; // Same category: the lesson transfers directly.
const SOURCE_MATCH_POINTS = 20;   // Same source: the audience/channel behavior repeats.
const TAG_POINTS_EACH = 10;       // Each shared tag: finer-grained topical overlap.
const TAG_POINTS_CAP = 40;        // Tags alone can never outweigh category+source.
const MAX_SCORE = 100;

function normalizeTags(tags: string[] | null | undefined): string[] {
  if (!Array.isArray(tags)) return [];
  const out: string[] = [];
  for (const t of tags) {
    const n = String(t || '').trim().toLowerCase();
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

export function matchPatterns(context: MatchContext, patterns: MatchablePattern[]): PatternMatch[] {
  const ctxCategory = String(context.category || '').trim().toLowerCase();
  const ctxSource = String(context.source || '').trim().toLowerCase();
  const ctxTags = normalizeTags(context.tags);

  const matches: PatternMatch[] = [];
  for (const p of patterns) {
    const reasons: string[] = [];
    let score = 0;

    if (ctxCategory && String(p.category || '').trim().toLowerCase() === ctxCategory) {
      score += CATEGORY_MATCH_POINTS;
      reasons.push('Same category (' + p.category + ') — the lesson was learned in this arena.');
    }
    if (ctxSource && p.source && String(p.source).trim().toLowerCase() === ctxSource) {
      score += SOURCE_MATCH_POINTS;
      reasons.push('Same source (' + p.source + ') — channel behavior tends to repeat.');
    }

    const pTags = normalizeTags(p.tags);
    const shared = ctxTags.filter(t => pTags.includes(t));
    if (shared.length) {
      const tagPoints = Math.min(TAG_POINTS_CAP, shared.length * TAG_POINTS_EACH);
      score += tagPoints;
      reasons.push('Shared tags: ' + shared.join(', ') + '.');
    }

    if (score <= 0) continue; // No concrete overlap — excluded, not padded.

    matches.push({
      patternId: p.id,
      kind: p.kind,
      title: p.title,
      summary: p.summary,
      score: Math.min(MAX_SCORE, score),
      reasons,
    });
  }

  // Stable sort: equal relevance keeps library order — replays never shuffle.
  return matches.sort((a, b) => b.score - a.score);
}
