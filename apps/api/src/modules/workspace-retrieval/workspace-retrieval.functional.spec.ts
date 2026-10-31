// ============================================================================
// FILE: /apps/api/src/modules/workspace-retrieval/workspace-retrieval.functional.spec.ts
// ============================================================================
// FUNCTIONAL tests for workspace retrieval (FORGE AI-062..066): the behavior
// a user actually experiences over behavior-true repository doubles:
// version-exact library docs, per-user workspace recording and retrieval,
// hybrid lane fusion, MMR re-ranking, and research reports that are only
// ever recorded with zero-trust isolation between users.

import { WorkspaceContentItem } from './entities/workspace-content-item.entity';
import { ResearchReport } from './entities/research-report.entity';
import { WorkspaceRetrievalService } from './workspace-retrieval.service';

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
    if (opts.take) out = out.slice(0, opts.take);
    return out;
  }
  async findOne(opts: any = {}): Promise<T | null> {
    const all = await this.find({ ...opts });
    return all[0] ?? null;
  }
}

function makeService() {
  const items = new RepoDouble<WorkspaceContentItem>();
  const reports = new RepoDouble<ResearchReport>();
  const svc = new WorkspaceRetrievalService(items as any, reports as any);
  return { svc, items, reports };
}

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

describe('workspace-retrieval functional lifecycle (FORGE AI-062..066)', () => {
  it('lists the library catalog and pins version-exact docs search', async () => {
    const { svc } = makeService();
    const catalog = svc.listLibraryCatalog();
    expect(catalog.map((c) => c.name)).toEqual(['react', 'express', 'typeorm']);
    expect(catalog[0].versions).toEqual(['18.2.0', '19.0.0']);

    const older = await svc.searchLibraryDocs({
      library: 'React',
      version: '18.2.0',
      query: 'state',
    } as any);
    expect(older.library).toBe('react');
    expect(older.version).toBe('18.2.0');
    expect(older.results.map((r) => r.symbol)).toEqual(['useState']);

    const newer = await svc.searchLibraryDocs({
      library: 'react',
      version: '19.0.0',
      query: 'state actions',
    } as any);
    expect(newer.results.map((r) => r.symbol)).toEqual(['useState']);
    expect(newer.results[0].summary).toBe('Adds state with actions support');

    // searchLibraryDocs is a SYNC service method: its refusals throw
    // synchronously, so these must be asserted with a plain throw matcher,
    // not .rejects (a sync throw never becomes a rejected promise).
    expect(() =>
      svc.searchLibraryDocs({ library: 'react', version: '17.0.2', query: 'state' } as any),
    ).toThrow('docs-version-unknown:react:17.0.2');
    expect(() =>
      svc.searchLibraryDocs({ library: 'react', version: '18.2.0', query: '   ' } as any),
    ).toThrow('docs-query-missing');
  });

  it('records items all-or-nothing and refuses unknown sources or links with zero rows', async () => {
    const { svc, items } = makeService();
    const first = await svc.recordContentItems(USER, {
      items: [
        { source: 'code', title: 'Payments service', body: 'Handles refunds and charges' },
        { source: 'Docs', title: 'Refund policy', body: 'Refunds land in 5 days' },
      ],
    } as any);
    expect(first.recorded).toBe(2);
    expect(items.rows).toHaveLength(2);
    expect(items.rows[1].source).toBe('docs');

    await expect(
      svc.recordContentItems(USER, {
        items: [
          { source: 'issues', title: 'Refund bug', body: 'Double refund edge case' },
          { source: 'wiki', title: 'Wrong place', body: 'Not a source' },
        ],
      } as any),
    ).rejects.toThrow('item-source-unknown:wiki');
    expect(items.rows).toHaveLength(2);

    await expect(
      svc.recordContentItems(USER, {
        items: [{ source: 'docs', title: '   ', body: 'Body' }],
      } as any),
    ).rejects.toThrow('item-title-missing');
    await expect(
      svc.recordContentItems(USER, { items: [] } as any),
    ).rejects.toThrow('items-empty');
    await expect(
      svc.recordContentItems(USER, {
        items: [{ source: 'docs', title: 'Notes', body: 'Body', links: ['row-99'] }],
      } as any),
    ).rejects.toThrow('item-link-unknown:row-99');
    expect(items.rows).toHaveLength(2);

    const linked = await svc.recordContentItems(USER, {
      items: [
        {
          source: 'issues',
          title: 'Refund bug',
          body: 'Double refund edge case',
          links: [items.rows[1].id],
        },
      ],
    } as any);
    expect(linked.recorded).toBe(1);
    expect(linked.items[0].links).toEqual([items.rows[1].id]);
    expect(items.rows).toHaveLength(3);
  });

  it('ranks workspace hits by engine law and stays isolated per user', async () => {
    const { svc } = makeService();
    await svc.recordContentItems(USER, {
      items: [
        { source: 'code', title: 'Payments service', body: 'Handles refunds and charges' },
        { source: 'docs', title: 'Refund policy', body: 'Refunds land in 5 days' },
        { source: 'issues', title: 'Refund bug', body: 'Double refund edge case' },
        { source: 'chats', title: 'Standup', body: 'Nothing new today' },
        { source: 'assets', title: 'Logo', body: 'Brand png' },
      ],
    } as any);
    const all = await svc.searchWorkspace(USER, { query: 'refund' } as any);
    expect(all.hits).toHaveLength(3);
    expect(all.hits.map((h) => h.score)).toEqual([4, 4, 1]);
    expect(all.hits.map((h) => h.title).sort()).toEqual([
      'Payments service',
      'Refund bug',
      'Refund policy',
    ]);

    const code = await svc.searchWorkspace(USER, {
      query: 'refund',
      sources: ['code'],
    } as any);
    expect(code.hits.map((h) => h.title)).toEqual(['Payments service']);

    const none = await svc.searchWorkspace(USER, { query: 'quantum' } as any);
    expect(none.hits).toEqual([]);

    const theirs = await svc.searchWorkspace(OTHER, { query: 'refund' } as any);
    expect(theirs.hits).toEqual([]);

    await expect(
      svc.searchWorkspace(USER, { query: 'refund', sources: ['code', 'wiki'] } as any),
    ).rejects.toThrow('retrieval-source-unknown:wiki');
    await expect(
      svc.searchWorkspace(USER, { query: '  ' } as any),
    ).rejects.toThrow('retrieval-query-missing');

    const limited = await svc.listContentItems(USER, '2');
    expect(limited).toHaveLength(2);
    const theirsItems = await svc.listContentItems(OTHER);
    expect(theirsItems).toHaveLength(0);
  });

  it('fuses hybrid lanes over recorded items and keeps the graph honest', async () => {
    const { svc } = makeService();
    const batch = await svc.recordContentItems(USER, {
      items: [
        { source: 'docs', title: 'Refund notes', body: 'refund edge cases' },
        { source: 'docs', title: 'Design doc', body: 'colors and spacing' },
      ],
    } as any);
    const refundNotesId = batch.items[0].id;
    await svc.recordContentItems(USER, {
      items: [
        {
          source: 'code',
          title: 'Payments service',
          body: 'handles refunds',
          links: [refundNotesId],
        },
      ],
    } as any);

    const keyword = await svc.hybridSearchWorkspace(USER, {
      query: 'refund',
      lanes: ['keyword'],
    } as any);
    expect(keyword.hits.map((h) => h.id)).toEqual([refundNotesId]);

    const graph = await svc.hybridSearchWorkspace(USER, {
      query: 'refund',
      lanes: ['graph'],
    } as any);
    expect(graph.hits).toHaveLength(1);
    expect(graph.hits[0].id === refundNotesId).toBe(false);

    const fused = await svc.hybridSearchWorkspace(USER, {
      query: 'refund edge cases',
    } as any);
    expect(fused.hits[0].id).toBe(refundNotesId);

    const theirs = await svc.hybridSearchWorkspace(OTHER, { query: 'refund' } as any);
    expect(theirs.hits).toEqual([]);

    await expect(
      svc.hybridSearchWorkspace(USER, { query: 'refund', lanes: ['semantic'] } as any),
    ).rejects.toThrow('hybrid-lane-unknown:semantic');
    await expect(
      svc.hybridSearchWorkspace(USER, {
        query: 'refund',
        weights: { keyword: 0, vector: 0, graph: 0 },
      } as any),
    ).rejects.toThrow('hybrid-weights-invalid');
    expect(svc.listHybridLanes()).toEqual(['keyword', 'vector', 'graph']);
    expect(svc.listRetrievalSources()).toEqual(['code', 'docs', 'issues', 'chats', 'assets']);
  });

  it('reranks with first-wins dedup and named diversity refusals', async () => {
    const { svc } = makeService();
    const candidates = [
      { key: 'payments-service', title: 'Payments service', body: 'handles refunds', score: 0.9 },
      {
        key: 'Payments-Service ',
        title: 'Payments service duplicate',
        body: 'handles refunds',
        score: 0.95,
      },
      { key: 'design-doc', title: 'Design doc', body: 'colors and spacing', score: 0.5 },
    ];
    const out = await svc.rerankResults({ candidates } as any);
    expect(out.removedDuplicates).toBe(1);
    expect(out.results.map((r) => r.key)).toEqual(['payments-service', 'design-doc']);

    await expect(
      svc.rerankResults({ candidates, depth: 0 } as any),
    ).rejects.toThrow('rerank-depth-invalid');
    await expect(
      svc.rerankResults({ candidates, lambda: 1.5 } as any),
    ).rejects.toThrow('rerank-lambda-invalid');
    await expect(svc.rerankResults({ candidates: [] } as any)).rejects.toThrow(
      'rerank-candidates-empty',
    );
  });

  it('plans research with the canonical step order', async () => {
    const { svc } = makeService();
    expect(svc.listResearchSteps()).toEqual(['search', 'read', 'cross-check', 'draft']);

    const full = await svc.planResearch({ topic: 'payments' } as any);
    expect(full.steps).toEqual(['search', 'read', 'cross-check', 'draft']);
    expect(full.stepCount).toBe(4);

    const partial = await svc.planResearch({
      topic: 'payments',
      steps: ['Search', 'DRAFT'],
    } as any);
    expect(partial.steps).toEqual(['search', 'draft']);

    await expect(
      svc.planResearch({ topic: 'payments', steps: ['read', 'search'] } as any),
    ).rejects.toThrow('research-steps-out-of-order');
    await expect(
      svc.planResearch({ topic: 'payments', steps: ['search', 'reflect'] } as any),
    ).rejects.toThrow('research-step-unknown:reflect');
    await expect(svc.planResearch({ topic: '  ' } as any)).rejects.toThrow(
      'research-topic-missing',
    );
  });

  it('records research reports with verified counts and never leaks across users', async () => {
    const { svc, reports } = makeService();
    const report = await svc.buildReport(USER, {
      topic: 'payments',
      findings: [
        { claim: 'Refunds take 5 days', sources: ['doc-1', 'issue-7'] },
        { claim: 'Charges are idempotent', sources: ['doc-2'] },
      ],
      openQuestions: ['Why do edge refunds retry?'],
    } as any);
    expect(report.summary).toBe('Investigation of payments with 2 findings');
    expect(report.verifiedCount).toBe(1);
    expect(report.unverifiedCount).toBe(1);
    expect(report.openQuestions).toEqual(['Why do edge refunds retry?']);
    expect(reports.rows).toHaveLength(1);
    expect(reports.rows[0].userId).toBe(USER);

    await expect(
      svc.buildReport(USER, {
        topic: 'payments',
        findings: [{ claim: '   ', sources: ['a'] }],
      } as any),
    ).rejects.toThrow('research-claim-missing');
    expect(reports.rows).toHaveLength(1);

    await expect(svc.getResearchReport(OTHER, report.id)).rejects.toThrow(
      'research-report-not-found:' + report.id,
    );
    const mine = await svc.getResearchReport(USER, report.id);
    expect(mine.topic).toBe('payments');

    const theirs = await svc.listResearchReports(OTHER);
    expect(theirs).toHaveLength(0);
    const mineList = await svc.listResearchReports(USER);
    expect(mineList).toHaveLength(1);
  });
});
