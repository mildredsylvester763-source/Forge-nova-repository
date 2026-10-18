// ============================================================================
// FILE: /apps/api/src/modules/egress-universal/engine/destination-query.ts
// ============================================================================
// Search and filter over the 888-destination catalog. Kinds and auth styles
// are validated against the catalog itself — an unknown filter value is a
// named refusal, not a silent empty list. Pure: no DB, no clock.

export type Verdict<T> = { ok: true; value: T } | { ok: false; reason: string };

export interface DestinationLike {
  id: string;
  name: string;
  kind: string;
  authStyle: string;
}

export interface DestinationQuery {
  search?: unknown;
  kind?: unknown;
  authStyle?: unknown;
  limit?: unknown;
  offset?: unknown;
}

export interface QueryResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export const QUERY_MAX_LIMIT = 200;

function asTrimmedString(v: unknown, maxLength: number): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  if (trimmed.length === 0 || trimmed.length > maxLength) return null;
  return trimmed;
}

export function searchDestinations<T extends DestinationLike>(
  destinations: T[],
  query: DestinationQuery,
): Verdict<QueryResult<T>> {
  if (!Array.isArray(destinations)) return { ok: false, reason: 'destination-query-invalid-catalog' };
  if (!query || typeof query !== 'object') return { ok: false, reason: 'destination-query-invalid-query' };

  const knownKinds = new Set(destinations.map((d) => d.kind));
  const knownAuthStyles = new Set(destinations.map((d) => d.authStyle));

  let pool = destinations;

  // kind filter — must exist in the catalog or it is refused by name.
  if (query.kind !== undefined && query.kind !== null && query.kind !== '') {
    const kind = asTrimmedString(query.kind, 64);
    if (kind === null) return { ok: false, reason: 'destination-query-invalid-kind' };
    if (!knownKinds.has(kind)) return { ok: false, reason: 'destination-query-unknown-kind:' + kind };
    pool = pool.filter((d) => d.kind === kind);
  }

  // authStyle filter — same discipline.
  if (query.authStyle !== undefined && query.authStyle !== null && query.authStyle !== '') {
    const authStyle = asTrimmedString(query.authStyle, 64);
    if (authStyle === null) return { ok: false, reason: 'destination-query-invalid-auth-style' };
    if (!knownAuthStyles.has(authStyle)) return { ok: false, reason: 'destination-query-unknown-auth-style:' + authStyle };
    pool = pool.filter((d) => d.authStyle === authStyle);
  }

  // Free-text search on id or name, case-insensitive, substring.
  if (query.search !== undefined && query.search !== null && query.search !== '') {
    const search = asTrimmedString(query.search, 64);
    if (search === null) return { ok: false, reason: 'destination-query-invalid-search' };
    const needle = search.toLowerCase();
    pool = pool.filter(
      (d) => d.id.toLowerCase().includes(needle) || d.name.toLowerCase().includes(needle),
    );
  }

  // Pagination: bounded, ordered deterministically by catalog order.
  let limit = 50;
  if (query.limit !== undefined && query.limit !== null && query.limit !== '') {
    if (typeof query.limit !== 'string' || !/^\d{1,3}$/.test(query.limit) || Number(query.limit) < 1 || Number(query.limit) > QUERY_MAX_LIMIT) {
      return { ok: false, reason: 'destination-query-invalid-limit' };
    }
    limit = Number(query.limit);
  }
  let offset = 0;
  if (query.offset !== undefined && query.offset !== null && query.offset !== '') {
    if (typeof query.offset !== 'string' || !/^\d{1,7}$/.test(query.offset)) {
      return { ok: false, reason: 'destination-query-invalid-offset' };
    }
    offset = Number(query.offset);
  }

  const total = pool.length;
  const items = pool.slice(offset, offset + limit);
  return { ok: true, value: { items, total, limit, offset } };
}
