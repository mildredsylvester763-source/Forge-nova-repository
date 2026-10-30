// ============================================================================
// FILE: /apps/api/src/modules/reviews/engine/review-response-engine.ts
// ============================================================================
// The review-response drafting engine: pure, deterministic draft responses
// to customer reviews. It never pretends to post anything; it DRAFTS text
// the owner can edit and send themselves. Tone and rating must make sense
// together, or the engine refuses.

export type Verdict<T> = { ok: true; value: T } | { ok: false; reason: string };

export const TONES = ['professional', 'warm', 'apologetic'] as const;
export type ResponseTone = (typeof TONES)[number];

export const MAX_REVIEW_LENGTH = 2000;
export const MAX_NAME_LENGTH = 100;

export function buildReviewResponse(input: {
  rating: unknown;
  reviewText: unknown;
  customerName: unknown;
  tone: unknown;
}): Verdict<{ response: string }> {
  if (typeof input.rating !== 'number' || !Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    return { ok: false, reason: 'review-response-invalid-rating' };
  }
  if (typeof input.reviewText !== 'string' || !input.reviewText.trim().length || input.reviewText.length > MAX_REVIEW_LENGTH) {
    return { ok: false, reason: 'review-response-invalid-text' };
  }
  if (typeof input.customerName !== 'string' || !input.customerName.trim().length || input.customerName.length > MAX_NAME_LENGTH) {
    return { ok: false, reason: 'review-response-invalid-name' };
  }
  if (typeof input.tone !== 'string' || (TONES as readonly string[]).indexOf(input.tone) < 0) {
    return { ok: false, reason: 'review-response-invalid-tone' };
  }
  if (input.tone === 'apologetic' && input.rating >= 4) {
    return { ok: false, reason: 'review-response-tone-mismatch' };
  }
  const name = input.customerName.trim();
  const snippet = input.reviewText.trim().slice(0, 80);
  let opener: string;
  if (input.tone === 'warm') {
    opener = 'Thank you so much, ' + name + ', for taking the time to share this.';
  } else if (input.tone === 'apologetic') {
    opener = 'We are truly sorry, ' + name + ', that your experience fell short.';
  } else {
    opener = 'Thank you, ' + name + ', for your feedback.';
  }
  let body: string;
  if (input.rating >= 4) {
    body = ' We are glad you had a good experience. Your words mean a lot to us.';
  } else if (input.rating === 3) {
    body = ' We hear you on the mixed experience, and we are already looking at what we can improve.';
  } else {
    body = ' That is not the standard we hold ourselves to, and we would like the chance to make it right. Please reach out to us directly.';
  }
  return { ok: true, value: { response: opener + ' You wrote: "' + snippet + '".' + body } };
}
