// ============================================================================
// FILE: /apps/api/src/modules/web-search/web-search.functional.spec.ts
// ============================================================================
// FUNCTIONAL tests for the web search tool (FORGE AI-057..061): the behavior a
// user actually experiences over behavior-true repository doubles: searches
// ranked by the pure engines, per-workspace domain policy with deny-over-allow,
// page extraction with freshness, idempotent citations, and zero-trust
// isolation between users.

import { BadRequestException } from '@nestjs/common';
import { WebSearchQuery } from './entities/web-search-query.entity';
import { DomainRule } from './entities/domain-rule.entity';
import { FetchedPage } from './entities/fetched-page.entity';
import { CitationRecord } from './entities/citation-record.entity';
import { WebSearchService } from './web-search.service';

// ---- minimal TypeORM repository double (behavior-true, no DB needed) ----
class RepoDouble<T extends { id?: string }> {
  rows: T[] = [];
  seq = 0;
  create(partial: any): T {
    return { ...partial } as T;
  }
  async save(row: T): Promise<T> {
    // TypeORM fills @CreateDateColumn/@UpdateDateColumn on insert; the double
    // must be behavior-true to those columns or audit order breaks.
    if (!(row as any).createdAt) (row as any).createdAt = new Date();
    if (!(row as any).updatedAt) (row as any).updatedAt = new Date();
    if (!row.id) {
      row.id = 'row-' + ++this.seq;
      this.rows.push(row);
    } else {
      const i = this.rows.findIndex((r) => r.id === row.id);
      if (i >= 0) this.rows[i] = row;
      else this.rows.push(row);
    }
    return row;
  }
  async find(opts: any = {}): Promise<T[]> {
    let out = this.rows.filter((r) => !(r as any).deletedAt);
    const w = opts.where ?? {};
    for (const [k, v] of Object.entries(w)) {
      out = out.filter((r) => (r as any)[k] === v);
    }
    if (opts.order?.createdAt === 'DESC') {
      out = out
        .slice()
        .sort((a: any, b: any) => String(b.createdAt).localeCompare(String(a.createdAt)));
    }
    if (opts.order?.createdAt === 'ASC') {
      out = out
        .slice()
        .sort((a: any, b: any) => String(a.createdAt).localeCompare(String(b.createdAt)));
    }
    return out;
  }
  async findOne(opts: any = {}): Promise<T | null> {
    const all = await this.find({ ...opts });
    return all[0] ?? null;
  }
  async findAndCount(opts: any = {}): Promise<[T[], number]> {
    const all = await this.find(opts);
    return [all, all.length];
  }
}

function makeService() {
  const queries = new RepoDouble<WebSearchQuery>();
  const rules = new RepoDouble<DomainRule>();
  const pages = new RepoDouble<FetchedPage>();
  const citations = new RepoDouble<CitationRecord>();
  const svc = new WebSearchService(
    queries as any,
    rules as any,
    pages as any,
    citations as any,
  );
  return { svc, queries, rules, pages, citations };
}

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

const PAGE_HTML =
  '<html><head><title>Forge Guide</title><meta name="date" content="2020-01-15"></head>' +
  '<body><nav>menu home about</nav><script>secretTracker()</script>' +
  '<main><p>The forge guide explains nova training and serving with real examples for every feature.</p></main>' +
  '<footer>copyright footer</footer></body></html>';

describe('web-search functional lifecycle (FORGE AI-057..061)', () => {
  it('searches rank results by engine truths and persist the audit row', async () => {
    const { svc, queries } = makeService();
    const res = await svc.search(USER, {
      query: 'forge nova guide',
      results: [
        { title: 'forge nova guide overview', snippet: 'forge nova docs', url: 'https://docs.example.com/overview', authorityScore: 85 },
        { title: 'unrelated things happen here', snippet: 'nothing', url: 'https://other.example.org/post', authorityScore: 11 },
      ],
    } as any);
    expect(res.ranked).toHaveLength(2);
    expect((res.ranked[0] as any).url).toBe('https://docs.example.com/overview');
    expect((res.ranked[0] as any).score).toBe(88);
    expect((res.ranked[1] as any).url).toBe('https://other.example.org/post');
    expect((res.ranked[1] as any).score).toBe(6);
    expect(res.skipped).toHaveLength(0);
    expect(res.refusedReason).toBeNull();
    expect(queries.rows).toHaveLength(1);
    expect(queries.rows[0].userId).toBe(USER);
    expect(queries.rows[0].refusedReason).toBeNull();
  });

  it('refuses a search with no supplied results by name', async () => {
    const { svc } = makeService();
    await expect(svc.search(USER, { query: 'anything', results: [] } as any)).rejects.toThrow(
      'search-no-results-supplied',
    );
  });

  it('denies listed domains by name and never touches another user', async () => {
    const { svc } = makeService();
    await svc.setDomainRules(USER, { deny: ['tracker.io'] } as any);
    const mine = await svc.search(USER, {
      query: 'forge guide',
      results: [
        { title: 'forge guide docs', url: 'https://docs.example.com/overview' },
        { title: 'forge guide ads', url: 'https://ads.tracker.io/spy' },
      ],
    } as any);
    expect(mine.ranked).toHaveLength(1);
    expect((mine.ranked[0] as any).url).toBe('https://docs.example.com/overview');
    expect(mine.skipped).toEqual([
      { url: 'https://ads.tracker.io/spy', reason: 'domain-denied:ads.tracker.io' },
    ]);

    const theirs = await svc.search(OTHER, {
      query: 'forge guide',
      results: [
        { title: 'forge guide docs', url: 'https://docs.example.com/overview' },
        { title: 'forge guide ads', url: 'https://ads.tracker.io/spy' },
      ],
    } as any);
    expect(theirs.ranked).toHaveLength(2);
    expect(theirs.skipped).toHaveLength(0);
  });

  it('allow lists gate results per workspace without leaking across workspaces', async () => {
    const { svc } = makeService();
    await svc.setDomainRules(USER, { workspace: 'strict', allow: ['docs.example.com'] } as any);
    const strict = await svc.search(USER, {
      query: 'forge guide',
      workspace: 'strict',
      results: [
        { title: 'forge guide docs', url: 'https://docs.example.com/overview' },
        { title: 'forge guide random', url: 'https://random.example.net/post' },
      ],
    } as any);
    expect(strict.ranked).toHaveLength(1);
    expect((strict.skipped[0] as any).reason).toBe('domain-not-allowlisted:random.example.net');

    const open = await svc.search(USER, {
      query: 'forge guide',
      results: [
        { title: 'forge guide docs', url: 'https://docs.example.com/overview' },
        { title: 'forge guide random', url: 'https://random.example.net/post' },
      ],
    } as any);
    expect(open.ranked).toHaveLength(2);
  });

  it('fetchPage extracts, stamps freshness, refuses denied domains and stays isolated', async () => {
    const { svc, pages } = makeService();
    const first = await svc.fetchPage(USER, {
      url: 'https://docs.example.com/page',
      html: PAGE_HTML,
    } as any);
    expect(first.reused).toBe(false);
    expect(first.title).toBe('Forge Guide');
    expect(first.wordCount).toBe(14);
    expect(first.freshnessBand).toBe('stale');
    expect(String(first.content).includes('secretTracker')).toBe(false);

    const second = await svc.fetchPage(USER, {
      url: 'https://docs.example.com/page',
      html: '<html><body><p>one two three four five six seven eight nine ten eleven twelve thirteen</p></body></html>',
    } as any);
    expect(second.reused).toBe(true);
    expect(second.wordCount).toBe(13);
    expect(pages.rows).toHaveLength(1);

    const otherPages = await svc.listPages(OTHER);
    expect(otherPages).toHaveLength(0);

    await svc.setDomainRules(USER, { deny: ['docs.example.com'] } as any);
    await expect(
      svc.fetchPage(USER, { url: 'https://docs.example.com/page', html: PAGE_HTML } as any),
    ).rejects.toThrow(BadRequestException);
    await expect(
      svc.fetchPage(USER, { url: 'https://docs.example.com/page', html: PAGE_HTML } as any),
    ).rejects.toThrow('domain-denied:docs.example.com');
  });

  it('citations are idempotent and refusals leave no rows', async () => {
    const { svc, citations } = makeService();
    const dto = {
      claim: 'Forge   trains   on consented data only',
      sourceUrl: 'https://docs.example.com/training',
      sourceTitle: 'Training docs',
    };
    const first = await svc.createCitation(USER, dto as any);
    expect(first.reused).toBe(false);
    expect(first.claimText).toBe('Forge trains on consented data only');
    const repeat = await svc.createCitation(USER, dto as any);
    expect(repeat.reused).toBe(true);
    expect(citations.rows).toHaveLength(1);

    await expect(svc.createCitation(USER, { claim: 'ab', sourceUrl: 'https://x.com' } as any)).rejects.toThrow(
      'citation-too-short',
    );
    await expect(
      svc.createCitation(USER, { claim: 'a real claim', sourceUrl: 'http://x.com' } as any),
    ).rejects.toThrow('citation-insecure-scheme:http');
    expect(citations.rows).toHaveLength(1);

    const theirs = await svc.listCitations(OTHER);
    expect(theirs).toHaveLength(0);
  });

  it('rule validation refuses bad patterns and overlap with no side effects', async () => {
    const { svc, rules } = makeService();
    await expect(
      svc.setDomainRules(USER, { allow: ['bad_pattern.com'] } as any),
    ).rejects.toThrow('rules-invalid-domain:bad_pattern.com');
    await expect(
      svc.setDomainRules(USER, { allow: ['a.com'], deny: ['a.com'] } as any),
    ).rejects.toThrow('rules-allow-deny-overlap:a.com');
    expect(rules.rows).toHaveLength(0);

    const saved = await svc.setDomainRules(USER, { allow: ['docs.example.com'], deny: [] } as any);
    expect(saved.allow).toEqual(['docs.example.com']);
    expect(saved.deny).toEqual([]);
  });

  it('a search with zero allowed results persists the honest refusal', async () => {
    const { svc, queries } = makeService();
    await svc.setDomainRules(USER, { deny: ['docs.example.com'] } as any);
    const res = await svc.search(USER, {
      query: 'forge guide',
      results: [
        { title: 'forge guide one', url: 'https://docs.example.com/one' },
        { title: 'forge guide two', url: 'https://docs.example.com/two' },
      ],
    } as any);
    expect(res.ranked).toHaveLength(0);
    expect(res.skipped).toHaveLength(2);
    expect(res.refusedReason).toBe('search-no-allowed-results');
    expect(queries.rows).toHaveLength(1);
    expect(queries.rows[0].refusedReason).toBe('search-no-allowed-results');
  });
});
