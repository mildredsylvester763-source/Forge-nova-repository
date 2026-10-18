// ============================================================================
// FILE: /apps/api/src/modules/egress-universal/engine/connection-meta.ts
// ============================================================================
// Connection metadata: tags and notes. Tags are a bounded, lowercase,
// deduplicated vocabulary — a connection is findable by tag, never
// polluted by it. Pure: no DB, no clock; every refusal is named.

export type Verdict<T> = { ok: true; value: T } | { ok: false; reason: string };

export const TAGS_MAX = 12;
export const TAG_MAX_LENGTH = 24;
export const NOTES_MAX_LENGTH = 500;

export function normalizeTag(raw: unknown): Verdict<string> {
  if (typeof raw !== 'string') return { ok: false, reason: 'meta-invalid-tag' };
  const tag = raw.trim().toLowerCase();
  if (tag.length === 0 || tag.length > TAG_MAX_LENGTH) return { ok: false, reason: 'meta-invalid-tag-length' };
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(tag)) return { ok: false, reason: 'meta-invalid-tag-characters' };
  return { ok: true, value: tag };
}

export function normalizeTags(raw: unknown): Verdict<string[]> {
  if (!Array.isArray(raw)) return { ok: false, reason: 'meta-invalid-tags' };
  if (raw.length > TAGS_MAX) return { ok: false, reason: 'meta-too-many-tags' };
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const tag = normalizeTag(item);
    if (!tag.ok) return tag;
    if (!seen.has(tag.value)) {
      seen.add(tag.value);
      out.push(tag.value);
    }
  }
  return { ok: true, value: out };
}

export function validateNotes(raw: unknown): Verdict<string> {
  if (typeof raw !== 'string') return { ok: false, reason: 'meta-invalid-notes' };
  const notes = raw.trim();
  if (notes.length > NOTES_MAX_LENGTH) return { ok: false, reason: 'meta-notes-too-long' };
  return { ok: true, value: notes };
}
