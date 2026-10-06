// The zero-trust egress door under test. Real behaviors asserted here:
//   allowlist, input validation, clamping, per-user sliding-window rate
//   limiting, circuit breakers with half-open recovery, and gateway-
//   enforced timeouts. Adapters are mocked at the registered boundary.

import { EgressGatewayService } from './egress-gateway.service';
import { EgressDestination } from './egress.types';

function makeGateway(): EgressGatewayService {
  return new EgressGatewayService();
}

describe('EgressGatewayService', () => {
  afterEach(() => { jest.useRealTimers(); });

  describe('input validation (BLOCKED before any network I/O)', () => {
    it('rejects a malformed subreddit name', async () => {
      const gw = makeGateway();
      const res = await gw.getRedditHot('not a valid name!', 10);
      expect(res.ok).toBe(false);
      expect(res.error?.code).toBe('BLOCKED');
    });

    it('rejects an empty or oversized search query', async () => {
      const gw = makeGateway();
      const empty = await gw.searchGoogle('   ', 5);
      const oversized = await gw.searchGoogle('x'.repeat(257), 5);
      expect(empty.error?.code).toBe('BLOCKED');
      expect(oversized.error?.code).toBe('BLOCKED');
    });

    it('clamps caller-supplied limits into the safe range', async () => {
      const gw = makeGateway();
      const seen: any[] = [];
      gw.registerAdapter(EgressDestination.REDDIT, async (req) => { seen.push(req); return { children: [] }; });
      await gw.getRedditHot('validsub', 9999);
      expect(seen[0].params.limit).toBe(100);
    });
  });

  describe('allowlist', () => {
    it('refuses any destination not registered in the egress rules', async () => {
      const gw = makeGateway();
      const res = await gw.dispatch('stripe' as EgressDestination, 'GET', '/charges');
      expect(res.ok).toBe(false);
      expect(res.error?.code).toBe('BLOCKED');
      expect(res.error?.message).toContain('not registered');
    });
  });

  describe('sliding-window rate limiting (per user + destination)', () => {
    it('allows the configured quota then returns RATE_LIMITED with a 60s retry hint', async () => {
      const gw = makeGateway();
      gw.registerAdapter(EgressDestination.REDDIT, async () => ({ children: [] }));
      const user = 'rate-user';
      for (let i = 0; i < 60; i++) {
        const res = await gw.getRedditHot('validsub', 10, user);
        expect(res.ok).toBe(true);
      }
      const limited = await gw.getRedditHot('validsub', 10, user);
      expect(limited.ok).toBe(false);
      expect(limited.error?.code).toBe('RATE_LIMITED');
      expect(limited.error?.retryAfterMs).toBe(60000);
    });

    it('isolates users — one user exhausting a destination does not affect another', async () => {
      const gw = makeGateway();
      gw.registerAdapter(EgressDestination.REDDIT, async () => ({ children: [] }));
      for (let i = 0; i < 60; i++) {
        await gw.getRedditHot('validsub', 10, 'heavy-user');
      }
      const other = await gw.getRedditHot('validsub', 10, 'light-user');
      expect(other.ok).toBe(true);
    });
  });

  describe('circuit breaker', () => {
    it('opens after the failure threshold and short-circuits even a now-healthy adapter', async () => {
      const gw = makeGateway();
      let fail = true;
      gw.registerAdapter(EgressDestination.GITHUB, async () => {
        if (fail) throw new Error("upstream 502");
        return { items: [] };
      });
      const user = "breaker-user";
      // failureThreshold for GITHUB is 6.
      for (let i = 0; i < 6; i++) {
        const res = await gw.getGitHubTrending('typescript', 'weekly', user);
        expect(res.error?.code).toBe('DESTINATION_ERROR');
      }
      fail = false;
      const open = await gw.getGitHubTrending('typescript', 'weekly', user);
      expect(open.ok).toBe(false);
      expect(open.error?.code).toBe('CIRCUIT_OPEN');
    });

    it('reports the remaining cool-down so callers know when to retry', async () => {
      const gw = makeGateway();
      gw.registerAdapter(EgressDestination.GITHUB, async () => { throw new Error('down'); });
      const user = "cooldown-user";
      for (let i = 0; i < 6; i++) {
        await gw.getGitHubTrending('rust', 'weekly', user);
      }
      const res = await gw.getGitHubTrending('rust', 'weekly', user);
      expect(res.error?.code).toBe('CIRCUIT_OPEN');
      expect(res.error?.retryAfterMs).toBeGreaterThan(0);
      expect(res.error?.retryAfterMs).toBeLessThanOrEqual(60000);
    });
  });

  describe('gateway-enforced timeout', () => {
    it('returns TIMEOUT when an adapter hangs past the rule deadline', async () => {
      jest.useFakeTimers();
      const gw = makeGateway();
      gw.registerAdapter(EgressDestination.REDDIT, () => new Promise(() => undefined));
      const pending = gw.getRedditHot("hangsub", 10, "timeout-user");
      await jest.advanceTimersByTimeAsync(10000);
      const res = await pending;
      expect(res.ok).toBe(false);
      expect(res.error?.code).toBe('TIMEOUT');
    });
  });
});
