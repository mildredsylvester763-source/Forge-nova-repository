// ============================================================================
// FILE: /apps/api/src/common/testing/fake-repository.ts
// ============================================================================
// The standard in-memory stand-in for a TypeORM repository, used by every
// functional (multi-user scenario) spec. It implements exactly the methods
// the services call: create, save, findOne, find. No database needed, so
// these suites run in CI like any other test.

import { ObjectLiteral, Repository } from 'typeorm';

export interface FakeRepo<T> {
  repo: Repository<T>;
  rows: T[];
}

export function fakeRepo<T extends ObjectLiteral>(): FakeRepo<T> {
  const rows: T[] = [];
  let counter = 0;
  const repo = {
    create: (partial: Partial<T>): T => ({ ...partial }) as T,
    save: async (entity: T): Promise<T> => {
      const record = entity as Record<string, unknown>;
      if (!record['id']) {
        counter += 1;
        record['id'] = 'row-' + counter;
        rows.push(entity);
      }
      return entity;
    },
    findOne: async (opts: { where: Record<string, unknown> }): Promise<T | null> =>
      rows.find((r) =>
        Object.keys(opts.where).every(
          (k) => (r as Record<string, unknown>)[k] === opts.where[k],
        ),
      ) ?? null,
    find: async (opts: { where: Record<string, unknown> }): Promise<T[]> =>
      rows.filter((r) =>
        Object.keys(opts.where ?? {}).every(
          (k) => (r as Record<string, unknown>)[k] === opts.where[k],
        ),
      ),
  } as unknown as Repository<T>;
  return { repo, rows };
}
