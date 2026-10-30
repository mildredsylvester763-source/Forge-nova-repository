// ============================================================================
// FILE: /apps/api/src/modules/reviews/engine/review-request-engine.ts
// ============================================================================
// The review-request engine: pure eligibility and message decisions for
// "ask a happy customer for a review" automation. No sending happens here:
// the service records; this engine decides WHO is eligible, WHEN, and WHAT
// the message says. Every refusal is named.

export type Verdict<T> = { ok: true; value: T } | { ok: false; reason: string };

export const MIN_DAYS_BETWEEN_REQUESTS = 30;
export const DAY_MS = 86400000;
export const MAX_REQUESTS_PER_YEAR = 4;
export const CHANNELS = ['email', 'sms', 'whatsapp'] as const;
export const MAX_NAME_LENGTH = 100;
export const LINK_PATTERN = /^https?:\/\/[^\s]{4,480}$/;

export type ReviewChannel = (typeof CHANNELS)[number];

// Decides whether a review request to this customer is allowed RIGHT NOW.
// Laws: never more than one request per 30 days per customer, never more
// than 4 per calendar year per customer, and only known channels.
export function planReviewRequest(input: {
  nowMs: unknown;
  lastRequestAtMs: unknown;
  requestsThisYear: unknown;
  customerName: unknown;
  channel: unknown;
}): Verdict<{ eligible: true }> {
  if (
    typeof input.customerName !== 'string' ||
    !input.customerName.trim().length ||
    input.customerName.length > MAX_NAME_LENGTH
  ) {
    return { ok: false, reason: 'review-request-invalid-name' };
  }
  if (
    typeof input.channel !== 'string' ||
    (CHANNELS as readonly string[]).indexOf(input.channel) < 0
  ) {
    return { ok: false, reason: 'review-request-invalid-channel' };
  }
  if (typeof input.nowMs !== 'number' || !Number.isInteger(input.nowMs)) {
    return { ok: false, reason: 'review-request-invalid-times' };
  }
  if (
    typeof input.requestsThisYear !== 'number' ||
    !Number.isInteger(input.requestsThisYear) ||
    input.requestsThisYear < 0
  ) {
    return { ok: false, reason: 'review-request-invalid-count' };
  }
  if (input.lastRequestAtMs !== null) {
    if (
      typeof input.lastRequestAtMs !== 'number' ||
      !Number.isInteger(input.lastRequestAtMs) ||
      input.lastRequestAtMs > input.nowMs
    ) {
      return { ok: false, reason: 'review-request-invalid-times' };
    }
    if (input.nowMs - input.lastRequestAtMs < MIN_DAYS_BETWEEN_REQUESTS * DAY_MS) {
      return { ok: false, reason: 'review-request-too-frequent' };
    }
  }
  if (input.requestsThisYear >= MAX_REQUESTS_PER_YEAR) {
    return { ok: false, reason: 'review-request-yearly-cap-exceeded' };
  }
  return { ok: true, value: { eligible: true } };
}

// Builds the exact message text. The link must be a real http(s) URL.
export function buildRequestMessage(
  customerName: unknown,
  businessName: unknown,
  reviewLink: unknown,
): Verdict<{ message: string }> {
  if (
    typeof customerName !== 'string' ||
    !customerName.trim().length ||
    customerName.length > MAX_NAME_LENGTH
  ) {
    return { ok: false, reason: 'review-request-invalid-name' };
  }
  if (
    typeof businessName !== 'string' ||
    !businessName.trim().length ||
    businessName.length > MAX_NAME_LENGTH
  ) {
    return { ok: false, reason: 'review-request-invalid-business' };
  }
  if (typeof reviewLink !== 'string' || !LINK_PATTERN.test(reviewLink)) {
    return { ok: false, reason: 'review-request-invalid-link' };
  }
  const message =
    'Hi ' +
    customerName.trim() +
    ', thanks for choosing ' +
    businessName.trim() +
    '. If you have a moment, a quick review helps us a lot: ' +
    reviewLink;
  return { ok: true, value: { message } };
}
