// ============================================================================
// FILE: /apps/api/src/modules/referrals/referrals.functional.spec.ts
// ============================================================================
// Functional scenario tests: the REAL ReferralsService wired to in-memory
// repositories AND the REAL LoyaltyService. Multi-user flows: code
// generation, binding races, self-referral attempts, reward double-claim
// attempts, and points landing in the referrer is wallet.

import { Repository } from 'typeorm';
import { ReferralsService } from './referrals.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { LoyaltyAccount } from '../loyalty/entities/loyalty-account.entity';
import { LoyaltyEvent } from '../loyalty/entities/loyalty-event.entity';
import { ReferralCode } from './entities/referral-code.entity';
import { ReferralBinding } from './entities/referral-binding.entity';
import { ReferralReward } from './entities/referral-reward.entity';
import { CODE_ALPHABET } from './engine/referral-engine';

// An in-memory stand-in for a TypeORM repository. Same methods the
// service actually calls: create, save, findOne, find.
function fakeRepo<T>(): { repo: Repository<T>; rows: T[] } {
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

interface Harness {
  referrals: ReferralsService;
  loyalty: LoyaltyService;
  codes: ReferralCode[];
  bindings: ReferralBinding[];
  rewards: ReferralReward[];
  loyaltyEvents: LoyaltyEvent[];
}

function buildHarness(): Harness {
  const codes = fakeRepo<ReferralCode>();
  const bindings = fakeRepo<ReferralBinding>();
  const rewards = fakeRepo<ReferralReward>();
  const acc = fakeRepo<LoyaltyAccount>();
  const ev = fakeRepo<LoyaltyEvent>();
  const loyalty = new LoyaltyService(acc.repo, ev.repo);
  const referrals = new ReferralsService(codes.repo, bindings.repo, rewards.repo, loyalty);
  return {
    referrals,
    loyalty,
    codes: codes.rows,
    bindings: bindings.rows,
    rewards: rewards.rows,
    loyaltyEvents: ev.rows,
  };
}

describe('referral functional flows', () => {
  it('a user who asks for a code twice gets the SAME code, not a second one', async () => {
    const { referrals, codes } = buildHarness();
    const first = await referrals.generateCode('user-alice');
    const second = await referrals.generateCode('user-alice');
    expect(second.code).toBe(first.code);
    expect(codes.length).toBe(1);
  });

  it('two different users get different, valid, safe-alphabet codes', async () => {
    const { referrals } = buildHarness();
    const a = await referrals.generateCode('user-alice');
    const b = await referrals.generateCode('user-bob');
    expect(a.code).not.toBe(b.code);
    for (const row of [a, b]) {
      expect(row.code.length).toBe(8);
      for (const ch of row.code.split('')) {
        expect(CODE_ALPHABET.indexOf(ch)).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('a new customer binds to a referrer once; a second apply is refused', async () => {
    const { referrals, bindings } = buildHarness();
    const code = await referrals.generateCode('user-alice');
    const binding = await referrals.apply(code.code, 'user-carol');
    expect(binding.referrerId).toBe('user-alice');
    expect(binding.status).toBe('bound');
    await expect(referrals.apply(code.code, 'user-carol')).rejects.toThrow(
      'referral-already-bound',
    );
    expect(bindings.length).toBe(1);
  });

  it('a customer cannot refer themselves', async () => {
    const { referrals } = buildHarness();
    const code = await referrals.generateCode('user-alice');
    await expect(referrals.apply(code.code, 'user-alice')).rejects.toThrow(
      'referral-self-referral',
    );
  });

  it('applying an unknown or malformed code is refused by name', async () => {
    const { referrals } = buildHarness();
    await expect(referrals.apply('NOPECODE', 'user-x')).rejects.toThrow(
      'referral-code-not-found',
    );
    await expect(referrals.apply('ab', 'user-x')).rejects.toThrow(
      'referral-invalid-length',
    );
    await expect(referrals.apply('AB9YTPRI', 'user-x')).rejects.toThrow(
      'referral-invalid-characters',
    );
  });

  it('a purchase rewards the referrer with 500 real loyalty points', async () => {
    const h = buildHarness();
    const code = await h.referrals.generateCode('user-alice');
    await h.referrals.apply(code.code, 'user-carol');
    const reward = await h.referrals.reward('user-carol', 5000);
    expect(reward.points).toBe(500);
    expect(reward.purchaseCents).toBe(5000);
    // The 500 points actually landed in Alice is wallet.
    const wallet = await h.loyalty.getAccount('user-alice');
    expect(wallet.pointsBalance).toBe(500);
    expect(wallet.lifetimePoints).toBe(500);
    // The binding flipped to rewarded.
    expect(h.bindings[0].status).toBe('rewarded');
  });

  it('a second reward attempt for the same customer is refused, no double points', async () => {
    const h = buildHarness();
    const code = await h.referrals.generateCode('user-alice');
    await h.referrals.apply(code.code, 'user-carol');
    await h.referrals.reward('user-carol', 5000);
    await expect(h.referrals.reward('user-carol', 5000)).rejects.toThrow(
      'referral-already-rewarded',
    );
    // Still exactly one reward and 500 points, not 1000.
    expect(h.rewards.length).toBe(1);
    expect((await h.loyalty.getAccount('user-alice')).pointsBalance).toBe(500);
  });

  it('two referred customers can BOTH reward the same referrer', async () => {
    const h = buildHarness();
    const code = await h.referrals.generateCode('user-alice');
    await h.referrals.apply(code.code, 'user-carol');
    await h.referrals.apply(code.code, 'user-dave');
    await h.referrals.reward('user-carol', 2500);
    await h.referrals.reward('user-dave', 2500);
    const wallet = await h.loyalty.getAccount('user-alice');
    expect(wallet.pointsBalance).toBe(1000);
    expect(h.rewards.length).toBe(2);
    expect(h.bindings.length).toBe(2);
  });

  it('rewarding a customer who never bound is refused', async () => {
    const h = buildHarness();
    await expect(h.referrals.reward('user-ghost', 5000)).rejects.toThrow(
      'referral-not-bound',
    );
    expect(h.rewards.length).toBe(0);
  });

  it('the referrer listing shows their code, bindings and rewards only', async () => {
    const h = buildHarness();
    const codeA = await h.referrals.generateCode('user-alice');
    await h.referrals.generateCode('user-bob');
    await h.referrals.apply(codeA.code, 'user-carol');
    await h.referrals.apply(codeA.code, 'user-dave');
    await h.referrals.reward('user-carol', 1000);
    const list = await h.referrals.list('user-alice');
    expect(list.code?.code).toBe(codeA.code);
    expect(list.bindings.length).toBe(2);
    expect(list.rewards.length).toBe(1);
    // Bob sees only his own empty book.
    const bobList = await h.referrals.list('user-bob');
    expect(bobList.bindings.length).toBe(0);
    expect(bobList.rewards.length).toBe(0);
  });
});
