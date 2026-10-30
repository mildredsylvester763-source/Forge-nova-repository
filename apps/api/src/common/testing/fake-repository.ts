// ============================================================================
// FILE: /apps/api/src/common/testing/fake-repository.ts
// ============================================================================
// The standard in-memory stand-in for a TypeORM repository, used by every
// functional (multi-user scenario) spec. It implements exactly the methods
// the services call: create, save, findOne, find (with order, take and
// soft-delete awareness) and softDelete. No database needed, so these
// suites run in CI like any other test.

import { ObjectLiteral, Repository } from 'typeorm';

export interface FakeRepo<T extends ObjectLiteral> {
  repo: Repository<T>;
  rows: T[];
}

export function fakeRepo<T extends ObjectLiteral>(): FakeRepo<T> {
  const rows: T[] = [];
  let counter = 0;
  const asRecord = (r: T): Record<string, unknown> => r as Record<string, unknown>;
  const matchesWhere = (r: T, where: Record<string, unknown>): boolean =>
    Object.keys(where ?? {}).every((k) => asRecord(r)[k] === where[k]);
  const isDeleted = (r: T): boolean => asRecord(r)['deletedAt'] != null;
  const cmp = (a: unknown, b: unknown): number => {
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
    return String(a ?? '').localeCompare(String(b ?? ''));
  };
  const repo = {
    create: (partial: Partial<T>): T => ({ ...partial }) as T,
    save: async (entity: T): Promise<T> => {
      const record = asRecord(entity);
      if (!record['id']) {
        counter += 1;
        record['id'] = 'row-' + counter;
        rows.push(entity);
      }
      return entity;
    },
    findOne: async (opts: {
      where: Record<string, unknown>;
      withDeleted?: boolean;
    }): Promise<T | null> => {
      const found = rows
        .filter((r) => matchesWhere(r, opts.where))
        .filter((r) => opts.withDeleted === true || !isDeleted(r));
      return found.length ? found[0] : null;
    },
    find: async (opts: {
      where?: Record<string, unknown>;
      order?: Record<string, string>;
      take?: number;
      withDeleted?: boolean;
    }): Promise<T[]> => {
      let out = rows.filter((r) => matchesWhere(r, opts.where ?? {}));
      if (opts.withDeleted !== true) out = out.filter((r) => !isDeleted(r));
      if (opts.order) {
        const keys = Object.keys(opts.order);
        out = [...out].sort((x, y) => {
          for (const k of keys) {
            const d = cmp(asRecord(x)[k], asRecord(y)[k]);
            if (d !== 0) return opts.order && opts.order[k] === 'DESC' ? -d : d;
          }
          return 0;
        });
      }
      if (typeof opts.take === 'number' && opts.take >= 0) out = out.slice(0, opts.take);
      return out;
    },
    softDelete: async (criteria: Record<string, unknown>): Promise<void> => {
      rows.forEach((r) => {
        if (matchesWhere(r, criteria)) asRecord(r)['deletedAt'] = new Date();
      });
    },
  } as unknown as Repository<T>;
  return { repo, rows };
}
