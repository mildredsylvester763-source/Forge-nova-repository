// ============================================================================
// FILE: /apps/api/src/modules/payment-links/engine/payment-link-state.spec.ts
// ============================================================================
// Pinned expiry boundary, single-use and max-uses consumption, the amount
// cap, and a seeded 500-link sweep.

import { canConsumeLink, effectiveLinkStatus } from './payment-link-state';

const DAY_MS = 86_400_000;
const NOW = new Date(Date.UTC(2026, 9, 10, 12, 0, 0));

describe('effectiveLinkStatus', () => {
  it('projects expiry, single-use and max-uses consumption from stored active', () => {
    expect(effectiveLinkStatus({ status: 'active', singleUse: true, expiresAt: null }, NOW)).toBe('active');
    expect(
      effectiveLinkStatus({ status: 'active', singleUse: true, expiresAt: new Date(NOW.getTime() - 1000) }, NOW),
    ).toBe('expired');
    expect(effectiveLinkStatus({ status: 'active', singleUse: true, uses: 1 }, NOW)).toBe('consumed');
    expect(effectiveLinkStatus({ status: 'active', singleUse: false, maxUses: 3, uses: 3 }, NOW)).toBe('consumed');
    expect(effectiveLinkStatus({ status: 'active', singleUse: false, maxUses: 3, uses: 2 }, NOW)).toBe('active');
    expect(effectiveLinkStatus({ status: 'canceled', singleUse: true }, NOW)).toBe('canceled');
  });
});

describe('canConsumeLink', () => {
  it('refuses consumed, canceled and expired links with named reasons', () => {
    expect(canConsumeLink({ status: 'active', singleUse: true, uses: 1 }, NOW).allowed).toBe(false);
    expect(canConsumeLink({ status: 'canceled', singleUse: true }, NOW).allowed).toBe(false);
    expect(
      canConsumeLink({ status: 'active', singleUse: true, expiresAt: new Date(NOW.getTime() - DAY_MS) }, NOW).allowed,
    ).toBe(false);
  });

  it('enforces the amount cap but allows exact and under payments', () => {
    const link = { status: 'active' as const, singleUse: true, amountCents: 5000 };
    expect(canConsumeLink(link, NOW, 6000).allowed).toBe(false);
    expect(canConsumeLink(link, NOW, 5000).allowed).toBe(true);
    expect(canConsumeLink(link, NOW, 4000).allowed).toBe(true);
  });

  it('refuses non-positive payment amounts', () => {
    expect(canConsumeLink({ status: 'active', singleUse: true }, NOW, -5).allowed).toBe(false);
    expect(canConsumeLink({ status: 'active', singleUse: true }, NOW, 0).allowed).toBe(false);
  });
});

describe('500-link seeded sweep', () => {
  it('stays deterministic and never lets a non-active link be consumable', () => {
    function mulberry32(seed: number) {
      let a = seed >>> 0;
      return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    const rnd = mulberry32(31337);
    const statuses = ['active', 'consumed', 'canceled'] as const;
    for (let i = 0; i < 500; i++) {
      const link = {
        status: statuses[Math.floor(rnd() * 3)],
        singleUse: rnd() < 0.7,
        expiresAt: rnd() < 0.5 ? new Date(NOW.getTime() + (rnd() - 0.5) * 200 * DAY_MS) : null,
        amountCents: rnd() < 0.6 ? Math.floor(rnd() * 50_000) : null,
        uses: Math.floor(rnd() * 3),
        maxUses: rnd() < 0.3 ? 1 + Math.floor(rnd() * 3) : null,
      };
      const eff = effectiveLinkStatus(link, NOW);
      expect(eff).toBe(effectiveLinkStatus(link, NOW));
      const amt = Math.floor(rnd() * 60_000);
      const verdict = canConsumeLink(link, NOW, amt);
      if (eff !== 'active') {
        expect(verdict.allowed).toBe(false);
      }
      if (verdict.allowed && link.amountCents) {
        expect(amt).toBeLessThanOrEqual(link.amountCents);
      }
    }
  });
});
