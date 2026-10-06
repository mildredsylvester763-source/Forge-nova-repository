// Reddit scanner contract (Phase A, Feature 1). Every behavior the
// hardened scanner promises is pinned here: fail-visible egress handling,
// subreddit validation, cross-subreddit dedupe, NSFW/pin filtering, the
// maxSignals budget, the 0-100 engagement normalization, real created vs
// updated counting, and the partial/fail scan statuses. Repository and
// gateway boundaries are mocked; every decision asserted is the service's own.

import { Repository } from 'typeorm';
import { OpportunitiesService } from './opportunities.service';
import { OpportunitySource } from './enums';

function makeService() {
  const saved: any[] = [];
  const opportunityRepository = {
    create: jest.fn((x: any) => x),
    findOne: jest.fn(async () => null),
    save: jest.fn(async (x: any) => { saved.push(x); return x; }),
    find: jest.fn(async () => []),
  };
  const opportunityHistoryRepository = { create: jest.fn((x: any) => x), save: jest.fn(async (x: any) => x) };
  const opportunityScanRepository = {
    create: jest.fn((x: any) => x),
    save: jest.fn(async (x: any) => x),
    findOne: jest.fn(async () => null),
    find: jest.fn(async () => []),
    findAndCount: jest.fn(async () => [[], 0]),
  };
  const egressGateway = {
    getRedditHot: jest.fn(),
    getTwitterTrends: jest.fn(),
    searchGoogle: jest.fn(),
    getGoogleTrends: jest.fn(),
    getGitHubTrending: jest.fn(),
  };
  const configService = { get: jest.fn(), getOrThrow: jest.fn() };
  const service = new OpportunitiesService(
    opportunityRepository as unknown as Repository<any>,
    opportunityHistoryRepository as unknown as Repository<any>,
    opportunityScanRepository as unknown as Repository<any>,
    egressGateway as any,
    configService as any,
  );
  return { service, opportunityRepository, opportunityScanRepository, egressGateway, saved };
}

function redditEnvelope(children: any[]) {
  return { ok: true, data: { data: { children } }, meta: { destination: 'reddit', latencyMs: 5, attempt: 1 } };
}

function post(overrides: Record<string, any> = {}) {
  return {
    data: {
      id: 'abc123',
      title: 'I built a tool that automates invoicing',
      selftext: 'description here',
      permalink: '/r/Entrepreneur/comments/abc123/x/',
      ups: 1200,
      score: 1200,
      num_comments: 45,
      upvote_ratio: 0.95,
      over_18: false,
      stickied: false,
      tags: [],
      ...overrides,
    },
  };
}

function freshSummary(): any {
  return { byCategory: {}, bySource: {}, byRiskLevel: {} };
}

function scanWith(parameters: Record<string, any> = {}, extra: Record<string, any> = {}): any {
  return { id: 'scan-1', userId: 'u1', source: OpportunitySource.REDDIT, parameters, ...extra };
}

describe('Reddit scanner (scanReddit)', () => {
  it('persists valid posts as opportunities with a normalized 0-100 score', async () => {
    const ctx = makeService();
    ctx.egressGateway.getRedditHot.mockResolvedValue(redditEnvelope([post()]));
    const summary = freshSummary();
    await (ctx.service as any).scanReddit(scanWith({ query: 'Entrepreneur' }), 'u1', summary);
    expect(ctx.saved).toHaveLength(1);
    expect(ctx.saved[0].source).toBe(OpportunitySource.REDDIT);
    expect(ctx.saved[0].externalId).toBe('abc123');
    // 1200 upvotes + 45 comments → 20·log10(1246) = 61.86… normalized, NOT raw 1200.
    expect(ctx.saved[0].score).toBeGreaterThan(60);
    expect(ctx.saved[0].score).toBeLessThanOrEqual(100);
    expect(summary.created).toBe(1);
    expect(summary.updated).toBe(0);
  });

  it('treats a failed gateway envelope as a failure — never as zero posts', async () => {
    const ctx = makeService();
    ctx.egressGateway.getRedditHot.mockResolvedValue({
      ok: false,
      error: { code: 'RATE_LIMITED', message: 'Rate limit reached for reddit' },
      meta: { destination: 'reddit', latencyMs: 1, attempt: 1 },
    });
    const summary = freshSummary();
    await expect(
      (ctx.service as any).scanReddit(scanWith({ query: 'Entrepreneur' }), 'u1', summary),
    ).rejects.toThrow(/could not fetch any subreddit/);
    expect(summary.failures).toHaveLength(1);
    expect(summary.failures[0].code).toBe('RATE_LIMITED');
    expect(ctx.saved).toHaveLength(0);
  });

  it('records partial success: one subreddit fetches, another fails', async () => {
    const ctx = makeService();
    ctx.egressGateway.getRedditHot.mockImplementation(async (sub: string) => {
      if (sub === 'goodsub') return redditEnvelope([post()]);
      return { ok: false, error: { code: 'CIRCUIT_OPEN', message: 'circuit open' }, meta: {} };
    });
    const summary = freshSummary();
    await (ctx.service as any).scanReddit(scanWith({ query: 'goodsub, badsub' }), 'u1', summary);
    expect(ctx.saved).toHaveLength(1);
    expect(summary.failures).toHaveLength(1);
    expect(summary.failures[0].target).toBe('badsub');
  });

  it('rejects invalid subreddit names as warnings and throws when none are valid', async () => {
    const ctx = makeService();
    const summary = freshSummary();
    await expect(
      (ctx.service as any).scanReddit(scanWith({ query: 'not valid, a/b' }), 'u1', summary),
    ).rejects.toThrow(/no valid subreddit targets/);
    expect(summary.warnings).toHaveLength(1);
    expect(summary.warnings[0].message).toContain('not valid');
    expect(ctx.egressGateway.getRedditHot).not.toHaveBeenCalled();
  });

  it('skips NSFW and stickied posts', async () => {
    const ctx = makeService();
    ctx.egressGateway.getRedditHot.mockResolvedValue(
      redditEnvelope([post({ id: 'nsfw1', over_18: true }), post({ id: 'pin1', stickied: true }), post({ id: 'good1' })]),
    );
    const summary = freshSummary();
    await (ctx.service as any).scanReddit(scanWith({ query: 'Entrepreneur' }), 'u1', summary);
    expect(ctx.saved).toHaveLength(1);
    expect(ctx.saved[0].externalId).toBe('good1');
  });

  it('deduplicates the same post across overlapping subreddits', async () => {
    const ctx = makeService();
    ctx.egressGateway.getRedditHot.mockResolvedValue(redditEnvelope([post({ id: 'dup1' })]));
    const summary = freshSummary();
    await (ctx.service as any).scanReddit(scanWith({ query: 'Entrepreneur, sideproject' }), 'u1', summary);
    expect(ctx.saved).toHaveLength(1);
  });

  it('enforces the maxSignals budget across subreddits', async () => {
    const ctx = makeService();
    ctx.egressGateway.getRedditHot.mockResolvedValue(
      redditEnvelope([post({ id: 'p1' }), post({ id: 'p2' }), post({ id: 'p3' })]),
    );
    const summary = freshSummary();
    await (ctx.service as any).scanReddit(
      scanWith({ query: 'Entrepreneur', maxSignals: 2 }),
      'u1',
      summary,
    );
    expect(ctx.saved).toHaveLength(2);
  });

  it('caps subreddits at the configured maximum', async () => {
    const ctx = makeService();
    ctx.egressGateway.getRedditHot.mockResolvedValue(redditEnvelope([]));
    const summary = freshSummary();
    const eleven = Array.from({ length: 11 }, (_, i) => 'sub' + i).join(',');
    // 11 valid names but one has 4 chars — all match the pattern; cap must be 10.
    await (ctx.service as any).scanReddit(scanWith({ query: eleven }), 'u1', summary);
    expect(ctx.egressGateway.getRedditHot).toHaveBeenCalledTimes(10);
  });
});

describe('normalizeRedditEngagement (0-100 log scale)', () => {
  it('pins known vectors', () => {
    const { service } = makeService();
    const f = (service as any).normalizeRedditEngagement.bind(service);
    expect(f(0, 0)).toBe(0); // no engagement → 0
    expect(f(99, 0)).toBe(40); // 20·log10(100)
    expect(f(999, 0)).toBe(60); // 20·log10(1000)
    expect(f(9999, 0)).toBe(80); // 20·log10(10000)
    expect(f(99999, 0)).toBe(100); // 20·log10(100000)
    expect(f(10 ** 9, 10 ** 9)).toBe(100); // hard cap, never exceeds the domain
    expect(f(-50, -10)).toBe(0); // negative garbage degrades to 0
    expect(f(NaN, 5)).toBeGreaterThan(0); // NaN input ignored, comments still count
  });
});

describe('upsertScannedOpportunity (created vs updated)', () => {
  it('counts a new row as created and an existing one as updated', async () => {
    const ctx = makeService();
    ctx.opportunityRepository.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'existing', version: 3, save: undefined });
    const summary = freshSummary();
    const data = {
      title: 'T', source: OpportunitySource.REDDIT, externalId: 'x1',
      category: 'consulting', score: 50,
    };
    await (ctx.service as any).upsertScannedOpportunity('u1', data, summary);
    await (ctx.service as any).upsertScannedOpportunity('u1', data, summary);
    expect(summary.created).toBe(1);
    expect(summary.updated).toBe(1);
    expect(summary.bySource[OpportunitySource.REDDIT]).toBe(2);
  });
});

describe('createScan (budget persistence)', () => {
  it('stashes maxSignals into parameters so the cap survives reloads', async () => {
    const ctx = makeService();
    const saved = await (ctx.service as any).createScan('u1', {
      name: 'test scan',
      maxSignals: 7,
      parameters: { query: 'Entrepreneur' },
    });
    expect(saved.parameters.maxSignals).toBe(7);
    expect(saved.parameters.query).toBe('Entrepreneur');
  });
});

describe('runScan (status semantics)', () => {
  it('marks a scan partial when some sources failed', async () => {
    const ctx = makeService();
    const scan = scanWith({});
    scan.status = 'running';
    scan.startedAt = new Date();
    (ctx.service as any).executeScan = jest.fn(async () => ({
      opportunitiesFound: 5,
      opportunitiesCreated: 5,
      opportunitiesUpdated: 0,
      summary: { byCategory: {}, bySource: {}, byRiskLevel: {}, failures: [{ target: 'badsub', code: 'CIRCUIT_OPEN' }] },
      performance: {},
    }));
    const result = await (ctx.service as any).runScan(scan, 'u1');
    expect(result.status).toBe('partial');
  });

  it('marks a scan completed when nothing failed', async () => {
    const ctx = makeService();
    const scan = scanWith({});
    scan.status = 'running';
    (ctx.service as any).executeScan = jest.fn(async () => ({
      opportunitiesFound: 5,
      opportunitiesCreated: 5,
      opportunitiesUpdated: 0,
      summary: { byCategory: {}, bySource: {}, byRiskLevel: {} },
      performance: {},
    }));
    const result = await (ctx.service as any).runScan(scan, 'u1');
    expect(result.status).toBe('completed');
  });

  it('marks a scan failed when execution throws', async () => {
    const ctx = makeService();
    const scan = scanWith({});
    scan.status = 'running';
    (ctx.service as any).executeScan = jest.fn(async () => {
      throw new Error('Reddit scan could not fetch any subreddit');
    });
    const result = await (ctx.service as any).runScan(scan, 'u1');
    expect(result.status).toBe('failed');
    expect(result.completedAt).toBeInstanceOf(Date);
  });
});
