// ============================================================================
// FILE: /apps/api/src/modules/content/engine/content-engine.ts
// ============================================================================

// Pure content rules for the blog and newsletter side: posts with titles,
// slugs and bodies, subscriber emails, and issue subjects. Publishing is a
// one-way door and unsubscribing refuses to run twice. Every refusal is
// named.

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const EMAIL_PATTERN = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;

export type Verdict<T> = { ok: true; value: T } | { ok: false; reason: string };

export function validatePostTitle(raw: unknown): Verdict<string> {
  if (typeof raw !== 'string') {
    return { ok: false, reason: 'post-invalid-title' };
  }
  const trimmed = raw.trim();
  if (trimmed.length < 1 || trimmed.length > 120) {
    return { ok: false, reason: 'post-invalid-title' };
  }
  return { ok: true, value: trimmed };
}

export function validatePostSlug(raw: unknown): Verdict<string> {
  if (typeof raw !== 'string') {
    return { ok: false, reason: 'post-invalid-slug' };
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized.length < 1 || normalized.length > 80 || !SLUG_PATTERN.test(normalized)) {
    return { ok: false, reason: 'post-invalid-slug' };
  }
  return { ok: true, value: normalized };
}

export function validatePostBody(raw: unknown): Verdict<string> {
  if (typeof raw !== 'string') {
    return { ok: false, reason: 'post-invalid-body' };
  }
  const trimmed = raw.trim();
  if (trimmed.length < 1 || trimmed.length > 10000) {
    return { ok: false, reason: 'post-invalid-body' };
  }
  return { ok: true, value: trimmed };
}

export function validateEmail(raw: unknown): Verdict<string> {
  if (typeof raw !== 'string') {
    return { ok: false, reason: 'subscriber-invalid-email' };
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized.length < 5 || normalized.length > 254 || !EMAIL_PATTERN.test(normalized)) {
    return { ok: false, reason: 'subscriber-invalid-email' };
  }
  return { ok: true, value: normalized };
}

export function validateIssueSubject(raw: unknown): Verdict<string> {
  if (typeof raw !== 'string') {
    return { ok: false, reason: 'issue-invalid-subject' };
  }
  const trimmed = raw.trim();
  if (trimmed.length < 1 || trimmed.length > 120) {
    return { ok: false, reason: 'issue-invalid-subject' };
  }
  return { ok: true, value: trimmed };
}

// Publishing only works once, from draft to published.
export function planPublishPost(status: unknown): Verdict<string> {
  if (typeof status !== 'string' || (status !== 'draft' && status !== 'published')) {
    return { ok: false, reason: 'post-invalid-state' };
  }
  if (status !== 'draft') {
    return { ok: false, reason: 'post-already-published' };
  }
  return { ok: true, value: 'published' };
}

// Unsubscribing refuses unknown rows and rows that already left.
export function planUnsubscribe(row: unknown): Verdict<string> {
  if (typeof row !== 'object' || row === null) {
    return { ok: false, reason: 'subscriber-not-found' };
  }
  if ((row as { status?: unknown }).status === 'unsubscribed') {
    return { ok: false, reason: 'subscriber-already-unsubscribed' };
  }
  return { ok: true, value: 'unsubscribed' };
}
