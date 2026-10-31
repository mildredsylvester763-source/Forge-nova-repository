// ============================================================================
// Pure NPS engine, built on the standard Reichheld/Bain methodology used by
// the market (Delighted, AskNicely, Promoter.io, HubSpot): one 0-10
// "would you recommend us" question, 9-10 promoters / 7-8 passives /
// 0-6 detractors, an optional follow-up verbatim comment, a survey cadence
// cooldown so a customer is never spammed, and NPS = %promoters - %detractors.
// ============================================================================

export type Verdict<T> = { ok: true; value: T } | { ok: false; reason: string };

export const NPS_MIN = 0;
export const NPS_MAX = 10;
export const MAX_COMMENT_LENGTH = 1000;
export const NPS_CHANNELS = ['email', 'sms', 'link', 'in-app'] as const;
export const NPS_COOLDOWN_MS = 90 * 24 * 3600 * 1000; // quarterly cadence

export function classifyRating(score: number): Verdict<string> {
  if (!Number.isInteger(score) || score < NPS_MIN || score > NPS_MAX) {
    return { ok: false, reason: 'nps-invalid-rating' };
  }
  if (score >= 9) return { ok: true, value: 'promoter' };
  if (score >= 7) return { ok: true, value: 'passive' };
  return { ok: true, value: 'detractor' };
}

export function validateComment(comment: string | null | undefined): Verdict<string | null> {
  if (comment === undefined || comment === null) return { ok: true, value: null };
  if (typeof comment !== 'string') return { ok: false, reason: 'nps-invalid-comment' };
  if (comment.length > MAX_COMMENT_LENGTH) {
    return { ok: false, reason: 'nps-comment-too-long' };
  }
  return { ok: true, value: comment };
}

export function validateChannel(channel: string): Verdict<string> {
  if (typeof channel !== 'string' || !(NPS_CHANNELS as readonly string[]).includes(channel)) {
    return { ok: false, reason: 'nps-invalid-channel' };
  }
  return { ok: true, value: channel };
}

export function planNpsSurvey(lastResponseAtMs: number | null, nowMs: number): Verdict<null> {
  if (lastResponseAtMs === null) return { ok: true, value: null };
  if (!Number.isFinite(lastResponseAtMs)) return { ok: false, reason: 'nps-invalid-times' };
  if (nowMs - lastResponseAtMs < NPS_COOLDOWN_MS) {
    return { ok: false, reason: 'nps-too-frequent' };
  }
  return { ok: true, value: null };
}

export interface NpsCounts {
  promoters: number;
  passives: number;
  detractors: number;
}

export interface NpsScore {
  score: number;
  total: number;
  promoters: number;
  passives: number;
  detractors: number;
}

export function computeNpsScore(counts: NpsCounts): Verdict<NpsScore> {
  const { promoters, passives, detractors } = counts;
  const values = [promoters, passives, detractors];
  if (values.some((n) => !Number.isInteger(n) || n < 0)) {
    return { ok: false, reason: 'nps-invalid-count' };
  }
  const total = promoters + passives + detractors;
  if (total === 0) return { ok: false, reason: 'nps-no-responses' };
  const score = Math.round((100 * (promoters - detractors)) / total);
  return { ok: true, value: { score, total, promoters, passives, detractors } };
}
