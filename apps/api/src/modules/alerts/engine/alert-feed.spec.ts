// ============================================================================
// FILE: /apps/api/src/modules/alerts/engine/alert-feed.spec.ts
// ============================================================================
// Pinned ranking rules first, then the 500-feed sweep. Pure and
// deterministic: the same inbox always renders the same feed.

import {
  buildAlertFeed,
  categoryToProductType,
  HIGH_SCORE_DEFAULT,
  AlertItem,
  NotificationLike,
  OpportunityLike,
} from './alert-feed';

function notification(partial: Partial<NotificationLike>): NotificationLike {
  return {
    id: 'n1', type: 'scan_completed', title: 'Scan done', message: 'done',
    occurredAt: '2026-10-01T00:00:00.000Z',
    ...partial,
  };
}

function opportunity(partial: Partial<OpportunityLike>): OpportunityLike {
  return {
    id: 'o1', title: 'AI pet portraits', score: 80, status: 'discovered',
    category: 'ebooks',
    occurredAt: '2026-10-02T00:00:00.000Z',
    ...partial,
  };
}

describe('alert feed engine', () => {
  it('ranks critical above high above info, newest first within a rank', () => {
    const feed = buildAlertFeed({
      notifications: [
        notification({ id: 'a', type: 'scan_completed', occurredAt: '2026-10-03T00:00:00.000Z' }),
        notification({ id: 'b', type: 'decision', occurredAt: '2026-10-01T00:00:00.000Z' }),
        notification({ id: 'c', type: 'scan_failed', occurredAt: '2026-10-02T00:00:00.000Z' }),
      ],
      opportunities: [],
    });
    expect(feed.map((f) => f.key)).toEqual(['notification:b', 'notification:c', 'notification:a']);
  });

  it('surfaces high-score pre-build opportunities as spin-up eligible', () => {
    const feed = buildAlertFeed({
      notifications: [],
      opportunities: [opportunity({ id: 'o9', score: 76, status: 'discovered' })],
    });
    expect(feed).toHaveLength(1);
    expect(feed[0].kind).toBe('opportunity_signal');
    expect(feed[0].severity).toBe('high');
    expect(feed[0].spinUpEligible).toBe(true);
    expect(feed[0].reasons.join(' ')).toContain('76');
  });

  it('respects the exact threshold boundary (75 passes at the default)', () => {
    expect(HIGH_SCORE_DEFAULT).toBe(75);
    const at = buildAlertFeed({ notifications: [], opportunities: [opportunity({ score: 75 })] });
    const below = buildAlertFeed({ notifications: [], opportunities: [opportunity({ score: 74.9 })] });
    expect(at).toHaveLength(1);
    expect(below).toHaveLength(0);
  });

  it('never offers spin-up for opportunities already past the pre-build stage', () => {
    const feed = buildAlertFeed({
      notifications: [],
      opportunities: [opportunity({ score: 95, status: 'live' })],
    });
    expect(feed).toHaveLength(0);
  });

  it('never marks persisted notifications as spin-up eligible', () => {
    const feed = buildAlertFeed({
      notifications: [notification({ id: 'n2', type: 'decision' })],
      opportunities: [],
    });
    expect(feed[0].spinUpEligible).toBe(false);
  });

  it('treats unknown notification types as info instead of dropping them', () => {
    const feed = buildAlertFeed({
      notifications: [notification({ id: 'n3', type: 'mystery_event' })],
      opportunities: [],
    });
    expect(feed[0].severity).toBe('info');
    expect(feed[0].reasons.join(' ')).toContain('mystery_event');
  });

  it('dedupes identical keys so a retried event cannot flood the feed', () => {
    const one = notification({ id: 'same' });
    const feed = buildAlertFeed({ notifications: [one, one], opportunities: [] });
    expect(feed).toHaveLength(1);
  });

  it('is deterministic — same inbox, same feed', () => {
    const input = {
      notifications: [notification({ id: 'a', type: 'decision', occurredAt: '2026-10-01T00:00:00.000Z' })],
      opportunities: [opportunity({ id: 'o2', score: 90 })],
    };
    expect(buildAlertFeed(input)).toEqual(buildAlertFeed(input));
  });

  it('holds its invariants across a 500-feed sweep', () => {
    let state = 987654321 >>> 0;
    const rand = () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    };
    for (let sweep = 0; sweep < 500; sweep++) {
      const notifications: NotificationLike[] = [];
      for (let i = 0; i < 5; i++) {
        const types = ['decision', 'scan_failed', 'scan_completed', 'scan_update', 'system', 'unheard_of'];
        notifications.push(notification({
          id: 'n' + sweep + '-' + i,
          type: types[Math.floor(rand() * types.length)],
          occurredAt: '2026-10-' + String(1 + Math.floor(rand() * 28)).padStart(2, '0') + 'T00:00:00.000Z',
        }));
      }
      const opportunities: OpportunityLike[] = [];
      for (let i = 0; i < 5; i++) {
        const statuses = ['discovered', 'live', 'vetted', 'killed', 'new'];
        opportunities.push(opportunity({
          id: 'o' + sweep + '-' + i,
          score: rand() * 100,
          status: statuses[Math.floor(rand() * statuses.length)],
          occurredAt: '2026-10-' + String(1 + Math.floor(rand() * 28)).padStart(2, '0') + 'T00:00:00.000Z',
        }));
      }
      const feed = buildAlertFeed({ notifications, opportunities });
      // Sorted: severity rank, then newest first — no exceptions.
      const rankOrder: Record<string, number> = { critical: 0, high: 1, info: 2 };
      for (let i = 1; i < feed.length; i++) {
        const prev = feed[i - 1];
        const curr = feed[i];
        if (rankOrder[prev.severity] === rankOrder[curr.severity]) {
          expect(prev.occurredAt >= curr.occurredAt).toBe(true);
        } else {
          expect(rankOrder[prev.severity]).toBeLessThan(rankOrder[curr.severity]);
        }
      }
      // Unique keys only.
      const keys = feed.map((f: AlertItem) => f.key);
      expect(new Set(keys).size).toBe(keys.length);
      // Spin-up eligibility only on opportunity signals.
      for (const item of feed) {
        expect(item.spinUpEligible).toBe(item.kind === 'opportunity_signal');
      }
    }
  });
});

describe('category to product type mapping', () => {
  it('maps each family of categories to a sensible first draft', () => {
    expect(categoryToProductType('print_on_demand').productType).toBe('print_on_demand');
    expect(categoryToProductType('three_d_printing').productType).toBe('three_d_print');
    expect(categoryToProductType('merchandise').productType).toBe('custom_manufactured');
    expect(categoryToProductType('consulting').productType).toBe('service_package');
    expect(categoryToProductType('online_courses').productType).toBe('course');
    expect(categoryToProductType('templates').productType).toBe('template');
    expect(categoryToProductType('datasets').productType).toBe('dataset');
    expect(categoryToProductType('ai_wrappers').productType).toBe('tool');
    expect(categoryToProductType('newsletters').productType).toBe('ebook');
  });

  it('falls back to an honest bundle draft for unmapped categories, with a reason', () => {
    const mapping = categoryToProductType('lead_generation');
    expect(mapping.productType).toBe('bundle');
    expect(mapping.reason).toContain('lead_generation');
  });

  it('always explains itself', () => {
    expect(categoryToProductType('ebooks').reason.length).toBeGreaterThan(0);
  });
});
