import { manageSnapshot, serializeSnapshot, SNAPSHOT_MODES, SNAPSHOT_NAME_RE } from './snapshot-testing';

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('snapshot-testing engine (FORGE TQ-038)', () => {
  it('writes canonical snapshots with checksums', () => {
    const written = manageSnapshot({ name: 'order-summary', mode: 'write', value: { b: 2, a: [1, 2] } });
    expect(written.ok).toBe(true);
    expect(written.status).toBe('written');
    expect(written.serialized).toBe('{\n  "a": [\n    1,\n    2\n  ],\n  "b": 2\n}');
    expect(written.lines).toBe(7);
    expect(written.checksum).toBe('25b2a167');
    expect(SNAPSHOT_MODES).toEqual(['write', 'verify', 'update']);
    expect(SNAPSHOT_NAME_RE.test('order-summary')).toBe(true);
    expect(SNAPSHOT_NAME_RE.test('Bad Name!')).toBe(false);
  });

  it('verifies stored snapshots and reports the first differing line', () => {
    const written = manageSnapshot({ name: 'order-summary', mode: 'write', value: { b: 2, a: [1, 2] } });
    const serialized = written.serialized ?? '';
    const match = manageSnapshot({ name: 'order-summary', mode: 'verify', value: { b: 2, a: [1, 2] }, stored: serialized });
    expect(match.ok).toBe(true);
    expect(match.status).toBe('match');
    const changed = manageSnapshot({
      name: 'order-summary',
      mode: 'verify',
      value: { b: 2, a: [1, 3] },
      stored: serialized,
    });
    expect(changed.ok).toBe(false);
    expect(changed.reason).toBe('snapshot-mismatch:order-summary');
    expect(changed.firstDiffLine).toBe(4);
    const updated = manageSnapshot({
      name: 'order-summary',
      mode: 'update',
      value: { b: 3, a: [] },
      stored: serialized,
    });
    expect(updated.ok).toBe(true);
    expect(updated.status).toBe('updated');
    expect(updated.serialized).toBe('{\n  "a": [],\n  "b": 3\n}');
  });

  it('refuses invalid snapshot operations with named reasons', () => {
    expect(manageSnapshot({ mode: 'write', value: 1 })).toMatchObject({ reason: 'snapshot-name-missing' });
    expect(manageSnapshot({ name: 'Bad Name!', mode: 'write', value: 1 })).toMatchObject({
      reason: 'snapshot-name-invalid:Bad Name!',
    });
    expect(manageSnapshot({ name: 'x', value: 1 })).toMatchObject({ reason: 'snapshot-mode-missing' });
    expect(manageSnapshot({ name: 'x', mode: 'delete', value: 1 })).toMatchObject({
      reason: 'snapshot-mode-unknown:delete',
    });
    expect(manageSnapshot({ name: 'x', mode: 'write' })).toMatchObject({ reason: 'snapshot-value-missing' });
    expect(manageSnapshot({ name: 'x', mode: 'write', value: 1, stored: '{}' })).toMatchObject({
      reason: 'snapshot-exists:x',
    });
    expect(manageSnapshot({ name: 'x', mode: 'verify', value: 1 })).toMatchObject({
      reason: 'snapshot-missing:x',
    });
    expect(manageSnapshot({ name: 'x', mode: 'verify', value: 1, stored: 42 })).toMatchObject({
      reason: 'snapshot-stored-invalid',
    });
    expect(manageSnapshot({ name: 'x', mode: 'update', value: 1 })).toMatchObject({
      reason: 'snapshot-missing:x',
    });
  });

  it('matches an independent checksum oracle on 500 mulberry32(42) cases', () => {
    const rand = mulberry32(42);
    const oracleFnv = (text: string): string => {
      const F = 16777619;
      const Fh = F >>> 16;
      const Fl = F & 0xffff;
      let h = 0x811c9dc5;
      for (const ch of text) {
        h = (h ^ ch.charCodeAt(0)) >>> 0;
        const low = h & 0xffff;
        const high = h >>> 16;
        const mid = (high * Fl + low * Fh) % 65536;
        h = (mid * 65536 + low * Fl) % 4294967296;
      }
      return h.toString(16).padStart(8, '0');
    };
    const oracleCanon = (v: unknown): unknown => {
      if (Array.isArray(v)) return v.map(oracleCanon);
      if (v !== null && typeof v === 'object') {
        const out: Record<string, unknown> = {};
        for (const k of Object.keys(v as Record<string, unknown>).sort()) {
          out[k] = oracleCanon((v as Record<string, unknown>)[k]);
        }
        return out;
      }
      return v;
    };
    const randValue = (depth: number): unknown => {
      const kind = Math.floor(rand() * (depth >= 2 ? 5 : 7));
      if (kind === 0) return Math.floor(rand() * 1000);
      if (kind === 1) return 's' + Math.floor(rand() * 100);
      if (kind === 2) return rand() < 0.5;
      if (kind === 3) return null;
      if (kind === 4) return 'n' + Math.floor(rand() * 20) + '-' + Math.floor(rand() * 20);
      if (kind === 5) {
        const arr: unknown[] = [];
        const n = Math.floor(rand() * 3);
        for (let i = 0; i < n; i++) arr.push(randValue(depth + 1));
        return arr;
      }
      const obj: Record<string, unknown> = {};
      const n = Math.floor(rand() * 4);
      for (let i = 0; i < n; i++) obj['k' + Math.floor(rand() * 8)] = randValue(depth + 1);
      return obj;
    };
    for (let c = 0; c < 500; c++) {
      const value = randValue(0);
      const a = manageSnapshot({ name: 'case-' + c, mode: 'write', value });
      expect(a.ok).toBe(true);
      const b = manageSnapshot({ name: 'case-' + c, mode: 'write', value });
      expect(a.serialized).toBe(b.serialized);
      expect(a.checksum).toBe(b.checksum);
      expect(a.checksum).toBe(oracleFnv(a.serialized ?? ''));
      const reparsed = JSON.parse(a.serialized ?? 'null');
      expect(oracleCanon(reparsed)).toEqual(oracleCanon(value));
      const verify = manageSnapshot({ name: 'case-' + c, mode: 'verify', value, stored: a.serialized });
      expect(verify.ok).toBe(true);
      const str = JSON.stringify(value);
      const numMatch = str.match(/\d+/);
      if (numMatch) {
        const altStr = str.replace(numMatch[0], String(Number(numMatch[0]) + 1));
        const altVal = JSON.parse(altStr);
        const m = manageSnapshot({ name: 'case-' + c, mode: 'verify', value: altVal, stored: a.serialized });
        expect(m.ok).toBe(false);
        expect(m.reason).toBe('snapshot-mismatch:case-' + c);
        const altSer = serializeSnapshot(altVal);
        const sLines = (a.serialized ?? '').split('\n');
        const nLines = altSer.split('\n');
        let fd = -1;
        for (let i = 0; i < Math.max(sLines.length, nLines.length); i++) {
          if (sLines[i] !== nLines[i]) {
            fd = i + 1;
            break;
          }
        }
        expect(m.firstDiffLine).toBe(fd);
      }
      const updated = manageSnapshot({ name: 'case-' + c, mode: 'update', value, stored: a.serialized });
      expect(updated.status).toBe('updated');
    }
  });
});
