// ============================================================================
// FILE: /apps/api/src/modules/social/engine/social-engine.ts
// ============================================================================

// Pure scheduling rules for social posts, built from the market checklist
// used by tools like Buffer and Hootsuite: compose once, target several
// platforms, schedule ahead inside a sane window, and cancel before the
// planned moment. Every platform has its own text limit, every refusal is
// named, and nothing here claims a post was delivered.

export type Verdict<T> = { ok: true; value: T } | { ok: false; reason: string };

export const PLATFORM_LIMITS: Record<string, number> = {
  facebook: 63206,
  instagram: 2200,
  tiktok: 2200,
  linkedin: 3000,
  x: 280,
  threads: 500,
  bluesky: 300,
  mastodon: 500,
};

const MAX_TEXT = 63206;
const MAX_AHEAD_MS = 365 * 24 * 3600 * 1000;

export function validatePostText(raw: unknown): Verdict<string> {
  if (typeof raw !== 'string') {
    return { ok: false, reason: 'social-invalid-text' };
  }
  const trimmed = raw.trim();
  if (trimmed.length < 1 || trimmed.length > MAX_TEXT) {
    return { ok: false, reason: 'social-invalid-text' };
  }
  return { ok: true, value: trimmed };
}

export function validatePlatforms(raw: unknown): Verdict<string[]> {
  if (!Array.isArray(raw) || raw.length < 1) {
    return { ok: false, reason: 'social-needs-platforms' };
  }
  const seen = new Set<string>();
  for (const platform of raw) {
    if (typeof platform !== 'string' || !(platform in PLATFORM_LIMITS)) {
      return { ok: false, reason: 'social-invalid-platform' };
    }
    seen.add(platform);
  }
  return { ok: true, value: [...seen].sort() };
}

export function planSchedulePost(input: {
  rawText: unknown;
  rawPlatforms: unknown;
  nowMs: number;
  scheduledAtMs: unknown;
}): Verdict<{ text: string; platforms: string[]; scheduledAtMs: number }> {
  const text = validatePostText(input.rawText);
  if (!text.ok) return text;
  const platforms = validatePlatforms(input.rawPlatforms);
  if (!platforms.ok) return platforms;
  if (
    typeof input.scheduledAtMs !== 'number' ||
    !Number.isInteger(input.scheduledAtMs) ||
    input.scheduledAtMs <= input.nowMs
  ) {
    return { ok: false, reason: 'social-invalid-scheduled-at' };
  }
  if (input.scheduledAtMs - input.nowMs > MAX_AHEAD_MS) {
    return { ok: false, reason: 'social-schedule-too-far' };
  }
  for (const platform of platforms.value) {
    if (text.value.length > PLATFORM_LIMITS[platform]) {
      return { ok: false, reason: 'social-text-too-long-for-' + platform };
    }
  }
  return {
    ok: true,
    value: {
      text: text.value,
      platforms: platforms.value,
      scheduledAtMs: input.scheduledAtMs,
    },
  };
}

// Cancelling works while a post is still scheduled, refuses to run twice,
// and refuses any state it does not understand.
export function planCancelPost(status: unknown): Verdict<string> {
  if (status === 'scheduled') {
    return { ok: true, value: 'cancelled' };
  }
  if (status === 'cancelled') {
    return { ok: false, reason: 'social-already-cancelled' };
  }
  return { ok: false, reason: 'social-invalid-state' };
}
