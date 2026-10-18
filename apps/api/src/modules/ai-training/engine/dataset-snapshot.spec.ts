// ============================================================================
// FILE: /apps/api/src/modules/ai-training/engine/dataset-snapshot.spec.ts
// ============================================================================
import {
  buildSnapshot,
  DatasetItem,
  DatasetRecord,
  fingerprintDataset,
} from './dataset-snapshot';

const NOW = '2026-10-18T00:00:00Z';

const item = (id: string, over: Partial<DatasetItem> = {}): DatasetItem => ({
  id,
  kind: 'image',
  classification: 'private',
  consent: true,
  quality: 80,
  tags: ['manhwa'],
  ...over,
});

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('dataset snapshot engine (AI-005/006)', () => {
  it('first snapshot is version 1 with no parent', () => {
    const v1 = buildSnapshot({
      id: 'ds1',
      items: [item('a'), item('b', { kind: 'stroke-recording', quality: 95 })],
      now: NOW,
    });
    expect(v1.ok).toBe(true);
    if (!v1.ok) return;
    expect(v1.value.version).toBe(1);
    expect(v1.value.lineage.parentId).toBeNull();
    expect(v1.value.lineage.parentVersion).toBeNull();
  });

  it('child snapshot is parent version + 1 with a full lineage chain', () => {
    const v1 = buildSnapshot({
      id: 'ds1',
      items: [item('a'), item('b', { kind: 'stroke-recording', quality: 95 })],
      now: NOW,
    });
    expect(v1.ok).toBe(true);
    if (!v1.ok) return;
    const v2 = buildSnapshot({
      id: 'ds1',
      items: [
        item('a'),
        item('b', { kind: 'stroke-recording', quality: 95 }),
        item('c'),
      ],
      parent: v1.value,
      now: NOW,
    });
    expect(v2.ok).toBe(true);
    if (!v2.ok) return;
    expect(v2.value.version).toBe(2);
    expect(v2.value.lineage.parentId).toBe('ds1');
    expect(v2.value.lineage.parentVersion).toBe(1);
  });

  it('refuses identical re-snapshots by name (immutability law)', () => {
    const v1 = buildSnapshot({ id: 'ds1', items: [item('a')], now: NOW });
    expect(v1.ok).toBe(true);
    if (!v1.ok) return;
    const same = buildSnapshot({
      id: 'ds1',
      items: [item('a')],
      parent: v1.value,
      now: NOW,
    });
    expect(same.ok).toBe(false);
    if (same.ok) return;
    expect(same.reason).toBe('dataset-unchanged-content');
  });

  it('refuses items without consent, naming the item', () => {
    const r = buildSnapshot({
      id: 'ds1',
      items: [item('a', { consent: false })],
      now: NOW,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('dataset-item-without-consent:a');
  });

  it('refuses duplicate item ids by name', () => {
    const r = buildSnapshot({ id: 'ds1', items: [item('a'), item('a')], now: NOW });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('dataset-duplicate-item:a');
  });

  it('refuses empty datasets', () => {
    const r = buildSnapshot({ id: 'ds1', items: [], now: NOW });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('dataset-no-items');
  });

  it('refuses out-of-range quality scores by name', () => {
    const r = buildSnapshot({
      id: 'ds1',
      items: [item('a', { quality: 150 })],
      now: NOW,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('dataset-invalid-quality:a');
  });

  it('fingerprint is content truth: identical content, identical fingerprint', () => {
    const a = fingerprintDataset([item('x'), item('y')]);
    const b = fingerprintDataset([item('y'), item('x')]);
    expect(a).toBe(b);
    const c = fingerprintDataset([item('x'), item('y', { quality: 81 })]);
    expect(a).not.toBe(c);
  });

  it('500-sweep: builds, lineage, and immutability hold on every case', () => {
    const rnd = mulberry32(42);
    const kinds: DatasetItem['kind'][] = [
      'image',
      'stroke-recording',
      'sketch',
      'finished-work',
      'correction-pair',
      'rating',
    ];
    let built = 0;
    let consentRefusals = 0;
    for (let s = 0; s < 500; s++) {
      const n = 1 + Math.floor(rnd() * 8);
      const items: DatasetItem[] = [];
      for (let i = 0; i < n; i++) {
        items.push(
          item('i' + s + '_' + i, {
            kind: kinds[Math.floor(rnd() * kinds.length)],
            quality: Math.floor(rnd() * 101),
            consent: rnd() > 0.05,
            classification: rnd() > 0.5 ? 'public' : 'private',
          }),
        );
      }
      const r = buildSnapshot({ id: 'sw' + s, items, now: NOW });
      if (!r.ok) {
        expect(r.reason.startsWith('dataset-item-without-consent')).toBe(true);
        consentRefusals++;
        continue;
      }
      built++;
      const snap: DatasetRecord = r.value;
      expect(snap.version).toBe(1);
      const r2 = buildSnapshot({ id: 'sw' + s, items, parent: snap, now: NOW });
      expect(r2.ok).toBe(false);
      if (!r2.ok) expect(r2.reason).toBe('dataset-unchanged-content');
    }
    expect(built).toBeGreaterThan(350);
    expect(consentRefusals).toBeGreaterThan(0);
  });
});
