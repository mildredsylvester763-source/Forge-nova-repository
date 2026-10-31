// ============================================================================
// FILE: /apps/api/src/modules/websites/engine/website-engine.ts
// ============================================================================

// Pure website rules. A site starts from a template, collects pages built
// from simple section blocks, and can only go live once it has at least one
// page. Every refusal is named.

export const SITE_TEMPLATES = ['clean', 'bold', 'warm', 'minimal'];
export const BLOCK_TYPES = ['heading', 'text', 'image', 'button', 'contact'];
export const MAX_PAGE_BLOCKS = 20;

export type Verdict<T> = { ok: true; value: T } | { ok: false; reason: string };

export interface PageBlock {
  type: string;
  text: string;
}

export function validateSiteName(raw: unknown): Verdict<string> {
  if (typeof raw !== 'string') {
    return { ok: false, reason: 'site-invalid-name' };
  }
  const trimmed = raw.trim();
  if (trimmed.length < 1 || trimmed.length > 80) {
    return { ok: false, reason: 'site-invalid-name' };
  }
  return { ok: true, value: trimmed };
}

export function validateTemplate(raw: unknown): Verdict<string> {
  if (typeof raw !== 'string' || !SITE_TEMPLATES.includes(raw)) {
    return { ok: false, reason: 'site-invalid-template' };
  }
  return { ok: true, value: raw };
}

export function validatePageTitle(raw: unknown): Verdict<string> {
  if (typeof raw !== 'string') {
    return { ok: false, reason: 'page-invalid-title' };
  }
  const trimmed = raw.trim();
  if (trimmed.length < 1 || trimmed.length > 120) {
    return { ok: false, reason: 'page-invalid-title' };
  }
  return { ok: true, value: trimmed };
}

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function validateSlug(raw: unknown): Verdict<string> {
  if (typeof raw !== 'string') {
    return { ok: false, reason: 'page-invalid-slug' };
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized.length < 1 || normalized.length > 80 || !SLUG_PATTERN.test(normalized)) {
    return { ok: false, reason: 'page-invalid-slug' };
  }
  return { ok: true, value: normalized };
}

export function validateBlocks(raw: unknown): Verdict<PageBlock[]> {
  if (!Array.isArray(raw)) {
    return { ok: false, reason: 'page-invalid-blocks' };
  }
  if (raw.length < 1) {
    return { ok: false, reason: 'page-no-blocks' };
  }
  if (raw.length > MAX_PAGE_BLOCKS) {
    return { ok: false, reason: 'page-too-many-blocks' };
  }
  const blocks: PageBlock[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      return { ok: false, reason: 'page-invalid-blocks' };
    }
    const type = (item as { type?: unknown }).type;
    const text = (item as { text?: unknown }).text;
    if (typeof type !== 'string' || !BLOCK_TYPES.includes(type)) {
      return { ok: false, reason: 'page-invalid-block-type' };
    }
    if (typeof text !== 'string') {
      return { ok: false, reason: 'page-invalid-block-text' };
    }
    const trimmed = text.trim();
    if (trimmed.length < 1 || trimmed.length > 500) {
      return { ok: false, reason: 'page-invalid-block-text' };
    }
    blocks.push({ type, text: trimmed });
  }
  return { ok: true, value: blocks };
}

// A site can only be published once it has at least one page.
export function planPublish(pageCount: unknown): Verdict<string> {
  if (typeof pageCount !== 'number' || !Number.isInteger(pageCount) || pageCount < 0) {
    return { ok: false, reason: 'site-invalid-state' };
  }
  if (pageCount < 1) {
    return { ok: false, reason: 'site-no-pages' };
  }
  return { ok: true, value: 'published' };
}
