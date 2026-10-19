// ============================================================================
// FILE: /apps/api/src/modules/loyalty/loyalty.functional.spec.ts
// ============================================================================
// Functional scenario tests: the REAL LoyaltyService wired to in-memory
// repositories. These test product behaviour, not just arithmetic: two
// customers racing the same balances, double-spend attempts, isolation
// of ledgers between users, grant flow, and history.

import { BadRequestException } from '@nestjs/common';
import { ObjectLiteral, Repository } from 'typeorm';
import { LoyaltyService } from './loyalty.service';
import { LoyaltyAccount } from './entities/loyalty-account.entity';
import { LoyaltyEvent } from './entities/loyalty-event.entity';

// An in-memory stand-in for a TypeORM repository. Same methods the
// service actually calls: create, save, findOne, find.
function fakeRepo<T extends ObjectLiteral>(): { repo: Repository<T>; rows: T[] } {
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

function buildService(): {
  service: LoyaltyService;
  accounts: LoyaltyAccount[];
  events: LoyaltyEvent[];
} {
  const acc = fakeRepo<LoyaltyAccount>();
  const ev = fakeRepo<LoyaltyEvent>();
  const service = new LoyaltyService(acc.repo, ev.repo);
  return { service, accounts: acc.rows, events: ev.rows };
}

describe('loyalty functional flows', () => {
  it('two customers earn independently and keep isolated balances', async () => {
    const { service } = buildService();
    const alice = await service.earn('user-alice', 500, 'order 1');
    const bob = await service.earn('user-bob', 1200, 'order 2');
    expect(alice.pointsBalance).toBe(5);
    expect(alice.lifetimePoints).toBe(5);
    expect(bob.pointsBalance).toBe(12);
    expect(bob.lifetimePoints).toBe(12);
    // Re-read both: no cross-contamination.
    expect((await service.getAccount('user-alice')).pointsBalance).toBe(5);
    expect((await service.getAccount('user-bob')).pointsBalance).toBe(12);
  });

  it('floors partial earn units: 1099 cents earns 10 points, not 11', async () => {
    const { service } = buildService();
    const account = await service.earn('user-a', 1099, 'order 3');
    expect(account.pointsBalance).toBe(10);
  });

  it('redeem writes a negative ledger row and the balance after matches', async () => {
    const { service, events } = buildService();
    await service.earn('user-a', 1000, 'order 4');
    await service.redeem('user-a', 3, 'voucher');
    const ledger = events.filter((e) => (e as any).kind === 'redeem');
    expect(ledger.length).toBe(1);
    expect((ledger[0] as any).points).toBe(-3);
    expect((ledger[0] as any).balanceAfter).toBe(7);
    expect((await service.getAccount('user-a')).pointsBalance).toBe(7);
  });

  it('blocks a double-spend: second redeem beyond balance is refused', async () => {
    const { service } = buildService();
    await service.earn('user-a', 500, 'order 5');
    await service.redeem('user-a', 4, 'voucher 1');
    // Only 1 point left. Trying to spend 2 more must fail.
    await expect(service.redeem('user-a', 2, 'voucher 2')).rejects.toThrow(
      'loyalty-insufficient-points',
    );
    // Balance untouched by the refused attempt.
    expect((await service.getAccount('user-a')).pointsBalance).toBe(1);
  });

  it('a refused redeem leaves no ledger row behind', async () => {
    const { service, events } = buildService();
    await service.earn('user-a', 500, 'order 6');
    await expect(service.redeem('user-a', 99, 'too much')).rejects.toThrow(
      BadRequestException,
    );
    expect(events.filter((e) => (e as any).kind === 'redeem').length).toBe(0);
  });

  it('grant flow (referral rewards) raises balance AND lifetime', async () => {
    const { service } = buildService();
    await service.earn('user-a', 500, 'order 7');
    const after = await service.grantPointsToUser('user-a', 500, 'referral reward');
    expect(after.pointsBalance).toBe(10);
    expect(after.lifetimePoints).toBe(10);
  });

  it('one user cannot spend another user is points: ledgers are isolated', async () => {
    const { service } = buildService();
    await service.earn('user-alice', 1000, 'order 8');
    await service.earn('user-bob', 100, 'order 9');
    // Bob tries to spend 5 but only has 1.
    await expect(service.redeem('user-bob', 5, 'steal attempt')).rejects.toThrow(
      'loyalty-insufficient-points',
    );
    // Alice is balance is untouched by Bob is failed attempt.
    expect((await service.getAccount('user-alice')).pointsBalance).toBe(10);
    const bobEvents = await service.listEvents('user-bob');
    expect(bobEvents.length).toBe(1);
    expect((bobEvents[0] as any).kind).toBe('earn');
  });

  it('a brand new customer starts at a zero balance without earning anything', async () => {
    const { service } = buildService();
    const account = await service.getAccount('user-new');
    expect(account.pointsBalance).toBe(0);
    expect(account.lifetimePoints).toBe(0);
  });

  it('reason rules are enforced through the service too', async () => {
    const { service } = buildService();
    await expect(service.earn('user-a', 500, '')).rejects.toThrow(
      'loyalty-invalid-reason',
    );
    await expect(service.earn('user-a', 50, 'tiny')).rejects.toThrow(
      'loyalty-amount-too-small',
    );
  });
});
