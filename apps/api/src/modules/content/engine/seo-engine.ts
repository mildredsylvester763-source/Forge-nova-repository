// ============================================================================
// FILE: /apps/api/src/modules/content/engine/seo-engine.ts
// ============================================================================

// Pure SEO analysis rules, following the market checklist used by tools
// like Yoast: the focus keyword should appear in the title, the meta
// description, the slug and the first heading, the title and description
// should sit inside healthy length ranges, and the body should have enough
// words to matter. The analysis is honest: it reports checks and a score,
// never a promise of rankings.

export type Verdict<T> = { ok: true; value: T } | { ok: false; reason: string };

export const SEO_CHECK_IDS = [
  'keyword-in-title',
  'keyword-in-meta',
  'keyword-in-slug',
  'keyword-in-first-heading',
  'title-length',
  'meta-length',
  'slug-length',
  'body-length',
] as const;

export interface SeoCheck {
  id: string;
  passed: boolean;
}

export interface SeoAnalysis {
  checks: SeoCheck[];
  score: number;
  total: number;
}

export function validateSeoTitle(raw: unknown): Verdict<string> {
  if (typeof raw !== 'string') {
    return { ok: false, reason: 'seo-invalid-title' };
  }
  const trimmed = raw.trim();
  if (trimmed.length < 1 || trimmed.length > 60) {
    return { ok: false, reason: 'seo-invalid-title' };
  }
  return { ok: true, value: trimmed };
}

export function validateMetaDescription(raw: unknown): Verdict<string> {
  if (typeof raw !== 'string') {
    return { ok: false, reason: 'seo-invalid-meta' };
  }
  const trimmed = raw.trim();
  if (trimmed.length < 1 || trimmed.length > 160) {
    return { ok: false, reason: 'seo-invalid-meta' };
  }
  return { ok: true, value: trimmed };
}

export function validateSeoKeyword(raw: unknown): Verdict<string> {
  if (typeof raw !== 'string') {
    return { ok: false, reason: 'seo-invalid-keyword' };
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized.length < 1 || normalized.length > 80) {
    return { ok: false, reason: 'seo-invalid-keyword' };
  }
  return { ok: true, value: normalized };
}

export function analyzeSeo(input: {
  title: string;
  metaDescription: string;
  slug: string;
  keyword: string;
  firstHeading: string | null;
  bodyText: string;
}): SeoAnalysis {
  const title = input.title.trim().toLowerCase();
  const meta = input.metaDescription.trim().toLowerCase();
  const slug = input.slug.trim().toLowerCase();
  const keyword = input.keyword.trim().toLowerCase();
  const hyphenKeyword = keyword.split(/ +/).join('-');
  const firstHeading = input.firstHeading === null ? null : input.firstHeading.trim().toLowerCase();
  const body = input.bodyText.trim();
  const checks: SeoCheck[] = [
    { id: 'keyword-in-title', passed: title.includes(keyword) },
    { id: 'keyword-in-meta', passed: meta.includes(keyword) },
    { id: 'keyword-in-slug', passed: slug.includes(keyword) || slug.includes(hyphenKeyword) },
    { id: 'keyword-in-first-heading', passed: firstHeading !== null && firstHeading.includes(keyword) },
    { id: 'title-length', passed: title.length >= 30 && title.length <= 60 },
    { id: 'meta-length', passed: meta.length >= 70 && meta.length <= 160 },
    { id: 'slug-length', passed: slug.length >= 3 && slug.length <= 80 },
    { id: 'body-length', passed: body.length >= 200 },
  ];
  return { checks, score: checks.filter((c) => c.passed).length, total: checks.length };
}
