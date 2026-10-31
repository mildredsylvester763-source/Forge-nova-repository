import { RETRIEVAL_SOURCES, WorkspaceItem, searchWorkspaceContent } from './workspace-retrieval';

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('workspace retrieval engine AI-063', () => {
  const items: WorkspaceItem[] = [
    { id: 'i1', source: 'code', title: 'Payments service', body: 'Handles refunds and charges' },
    { id: 'i2', source: 'docs', title: 'Refund policy', body: 'Refunds land in 5 days' },
    { id: 'i3', source: 'issues', title: 'Refund bug', body: 'Double refund edge case' },
    { id: 'i4', source: 'chats', title: 'Standup', body: 'Nothing new today' },
    { id: 'i5', source: 'assets', title: 'Logo', body: 'Brand png' },
  ];

  it('pins the refusal catalog', () => {
    expect(searchWorkspaceContent({ items, query: '  ' })).toEqual({
      ok: false,
      reason: 'retrieval-query-missing',
    });
    expect(searchWorkspaceContent({ items, query: 'refund', sources: ['code', 'wiki'] })).toEqual({
      ok: false,
      reason: 'retrieval-source-unknown:wiki',
    });
    expect(searchWorkspaceContent({ items, query: 'refund', sources: 'code' as never })).toEqual({
      ok: false,
      reason: 'retrieval-sources-not-array',
    });
    expect(searchWorkspaceContent({ items, query: 'refund', sources: [] })).toEqual({
      ok: false,
      reason: 'retrieval-sources-empty',
    });
  });

  it('pins the ranking laws', () => {
    expect(searchWorkspaceContent({ items, query: 'refund' }).hits?.map((h) => h.id)).toEqual([
      'i2',
      'i3',
      'i1',
    ]);
    expect(searchWorkspaceContent({ items, query: 'refund' }).hits?.map((h) => h.score)).toEqual([4, 4, 1]);
    expect(
      searchWorkspaceContent({ items, query: 'refund', sources: ['code'] }).hits?.map((h) => h.id),
    ).toEqual(['i1']);
    expect(
      searchWorkspaceContent({ items, query: 'refund', sources: ['code', 'CODE', 'code'] }).hits?.map(
        (h) => h.id,
      ),
    ).toEqual(['i1']);
    expect(searchWorkspaceContent({ items, query: 'quantum' }).hits).toEqual([]);
    expect(searchWorkspaceContent({ items, query: 'brand' }).hits?.map((h) => h.id)).toEqual(['i5']);
  });

  it('sweeps 500 seeded cases against an independent oracle', () => {
    const rnd = mulberry32(42);
    const bank = ['refund', 'charge', 'logo', 'brand', 'standup', 'bug', 'policy', 'days', 'png', 'edge'];
    for (let i = 0; i < 500; i++) {
      const count = 1 + Math.floor(rnd() * 5);
      const sweepItems: WorkspaceItem[] = [];
      for (let j = 0; j < count; j++) {
        sweepItems.push({
          id: 'it' + j,
          source: RETRIEVAL_SOURCES[Math.floor(rnd() * RETRIEVAL_SOURCES.length)],
          title: bank[Math.floor(rnd() * bank.length)] + ' ' + bank[Math.floor(rnd() * bank.length)],
          body: bank[Math.floor(rnd() * bank.length)] + ' filler ' + bank[Math.floor(rnd() * bank.length)],
        });
      }
      const query = bank[Math.floor(rnd() * bank.length)] + (rnd() < 0.3 ? ' ' + bank[Math.floor(rnd() * bank.length)] : '');
      const sourceCount = Math.floor(rnd() * 4);
      const sources: string[] = [];
      for (let s = 0; s < sourceCount; s++) {
        sources.push(RETRIEVAL_SOURCES[Math.floor(rnd() * RETRIEVAL_SOURCES.length)]);
      }
      const verdict = searchWorkspaceContent({
        items: sweepItems,
        query,
        sources: sourceCount === 0 ? undefined : sources,
      });
      const q = query.trim().toLowerCase();
      const terms = q.split(/\s+/);
      const allowed =
        sourceCount === 0 ? [...RETRIEVAL_SOURCES] : [...new Set(sources.map((s) => s.toLowerCase()))];
      const want = sweepItems
        .filter((it) => allowed.includes(it.source))
        .map((it) => {
          let sc = 0;
          for (const t of terms) {
            if (it.title.toLowerCase().indexOf(t) !== -1) {
              sc += 3;
            }
            if (it.body.toLowerCase().indexOf(t) !== -1) {
              sc += 1;
            }
          }
          return { id: it.id, score: sc };
        })
        .filter((h) => h.score > 0)
        .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1))
        .map((h) => h.id + '#' + h.score);
      expect((verdict.hits ?? []).map((h) => h.id + '#' + h.score)).toEqual(want);
    }
  });
});
