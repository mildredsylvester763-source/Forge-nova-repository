// ============================================================================
// FILE: /apps/api/src/modules/agent/engine/nl-search.ts
// ============================================================================

// Natural-language search parsing: entity, amount floor/ceiling, quoted
// customer, and relative date windows ("this month", "last month").
// Amounts are parsed to integer cents; k suffix means thousand naira.
// A query with no recognized entity is a named refusal — search never
// floods the user with an unfiltered firehose.

export type Verdict<T> = { ok: true; value: T } | { ok: false; reason: string };

export interface SearchFilter {
  entity: string;
  minCents?: number;
  maxCents?: number;
  customer?: string;
  from?: string;
  to?: string;
}

const ENTITY_RULES: { entity: string; test: RegExp }[] = [
  { entity: 'invoices', test: /\binvoices?\b/ },
  { entity: 'expenses', test: /\bexpenses?\b/ },
  { entity: 'payments', test: /\bpayments?\b/ },
  { entity: 'quotes', test: /\bquotes?\b/ },
  { entity: 'contacts', test: /\bcontacts?\b/ },
];

function amountToCents(raw: string): number {
  const kSuffix = /k\b/i.test(raw);
  const numeric = parseFloat(raw.replace(/[₦$,\s]/gi, ''));
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(numeric * 100 * (kSuffix ? 1000 : 1));
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function parseSearchQuery(query: string, now: Date): Verdict<SearchFilter> {
  if (typeof query !== 'string' || !query.trim()) return { ok: false, reason: 'search-empty-query' };
  const lower = query.toLowerCase();

  let entity: string | null = null;
  for (const rule of ENTITY_RULES) {
    if (rule.test.test(lower)) {
      entity = rule.entity;
      break;
    }
  }
  if (!entity) return { ok: false, reason: 'search-too-vague' };

  const filter: SearchFilter = { entity };

  const overMatch = lower.match(/(?:over|above|more than|at least|min)\s*₦?\$?\s*([\d][\d,]*(?:\.\d+)?k?)/);
  if (overMatch) filter.minCents = amountToCents(overMatch[1]);
  const underMatch = lower.match(/(?:under|below|less than|max(?:imum)?)\s*₦?\$?\s*([\d][\d,]*(?:\.\d+)?k?)/);
  if (underMatch) filter.maxCents = amountToCents(underMatch[1]);

  const quoted = query.match(/"([^"]+)"/);
  if (quoted) filter.customer = quoted[1].trim().toLowerCase();

  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  if (/\blast\s+month\b/.test(lower)) {
    filter.from = isoDay(new Date(Date.UTC(year, month - 1, 1)));
    filter.to = isoDay(new Date(Date.UTC(year, month, 1)));
  } else if (/\bthis\s+month\b/.test(lower)) {
    filter.from = isoDay(new Date(Date.UTC(year, month, 1)));
    filter.to = isoDay(new Date(Date.UTC(year, month + 1, 1)));
  } else if (/\bthis\s+week\b/.test(lower)) {
    filter.from = isoDay(new Date(now.getTime() - 7 * 86400000));
    filter.to = isoDay(now);
  }

  return { ok: true, value: filter };
}
