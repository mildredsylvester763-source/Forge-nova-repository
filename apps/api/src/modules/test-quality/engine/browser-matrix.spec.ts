import { planMatrix, scoreMatrix, MATRIX_BROWSERS, MATRIX_PLATFORMS, MATRIX_VIEWPORTS, MatrixCombo } from './browser-matrix';

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('browser-matrix engine (FORGE TQ-040)', () => {
  it('plans the full 44-combo market matrix', () => {
    const plan = planMatrix({});
    expect(plan.ok).toBe(true);
    expect(plan.count).toBe(44);
    expect(plan.unsupportedSkipped).toBe(4);
    expect(plan.combos?.[0]).toEqual({ id: 'c1', browser: 'chrome', platform: 'desktop', viewport: '1280x720' });
    expect(MATRIX_BROWSERS).toEqual(['chrome', 'firefox', 'safari', 'edge']);
    expect(MATRIX_PLATFORMS).toEqual(['desktop', 'android', 'ios']);
    expect(MATRIX_VIEWPORTS).toEqual(['1280x720', '1920x1080', '375x667', '768x1024']);
  });

  it('scores coverage with the zero-failure requirement', () => {
    const plan = planMatrix({});
    const combos = (plan.combos ?? []) as MatrixCombo[];
    const results: Record<string, string> = {};
    for (const combo of combos) results[combo.id] = combo.id === 'c5' ? 'skip' : 'pass';
    const report = scoreMatrix({ combos, results });
    expect(report.total).toBe(44);
    expect(report.passed).toBe(43);
    expect(report.skipped).toBe(1);
    expect(report.coverage).toBe(97.73);
    expect(report.meets).toBe(false);
    const lenient = scoreMatrix({ combos, results, threshold: 97 });
    expect(lenient.meets).toBe(true);
    const failing: Record<string, string> = {};
    for (const combo of combos) failing[combo.id] = combo.id === 'c9' ? 'fail' : 'pass';
    const bad = scoreMatrix({ combos, results: failing, threshold: 50 });
    expect(bad.coverage).toBe(100);
    expect(bad.meets).toBe(false);
  });

  it('refuses invalid matrices with named reasons', () => {
    expect(planMatrix({ browsers: [] })).toMatchObject({ reason: 'matrix-browsers-missing' });
    expect(planMatrix({ platforms: 'desktop' })).toMatchObject({ reason: 'matrix-platforms-missing' });
    expect(planMatrix({ viewports: [] })).toMatchObject({ reason: 'matrix-viewports-missing' });
    expect(planMatrix({ browsers: ['opera'] })).toMatchObject({ reason: 'matrix-browser-unknown:opera' });
    expect(planMatrix({ platforms: ['wp'] })).toMatchObject({ reason: 'matrix-platform-unknown:wp' });
    expect(planMatrix({ viewports: ['999x999'] })).toMatchObject({
      reason: 'matrix-viewport-unknown:999x999',
    });
    expect(planMatrix({ browsers: ['safari'], platforms: ['android'], viewports: ['375x667'] })).toMatchObject({
      reason: 'matrix-combos-empty',
    });
    expect(scoreMatrix({ combos: [], results: {} })).toMatchObject({ reason: 'matrix-combos-empty' });
    expect(scoreMatrix({ combos: [{ id: '' }], results: {} })).toMatchObject({
      reason: 'matrix-combo-id-missing:1',
    });
    expect(scoreMatrix({ combos: [{ id: 'c1' }], results: 'pass' })).toMatchObject({
      reason: 'matrix-results-invalid',
    });
    expect(scoreMatrix({ combos: [{ id: 'c1' }], results: { c9: 'pass' } })).toMatchObject({
      reason: 'matrix-combo-unknown:c9',
    });
    expect(scoreMatrix({ combos: [{ id: 'c1' }], results: {} })).toMatchObject({
      reason: 'matrix-result-missing:c1',
    });
    expect(scoreMatrix({ combos: [{ id: 'c1' }], results: { c1: 'borked' } })).toMatchObject({
      reason: 'matrix-status-invalid:borked:c1',
    });
    expect(scoreMatrix({ combos: [{ id: 'c1' }], results: { c1: 'pass' }, threshold: 101 })).toMatchObject({
      reason: 'matrix-threshold-invalid:101',
    });
  });

  it('matches an independent triple-loop oracle on 500 mulberry32(42) cases', () => {
    const rand = mulberry32(42);
    const oraclePlan = (
      browsers: string[] | undefined,
      platforms: string[] | undefined,
      viewports: string[] | undefined,
    ): { refusal?: string; combos: MatrixCombo[]; skipped: number } => {
      if (browsers !== undefined && browsers.length === 0) return { refusal: 'matrix-browsers-missing', combos: [], skipped: 0 };
      if (platforms !== undefined && platforms.length === 0) return { refusal: 'matrix-platforms-missing', combos: [], skipped: 0 };
      if (viewports !== undefined && viewports.length === 0) return { refusal: 'matrix-viewports-missing', combos: [], skipped: 0 };
      const bs = browsers ?? [...MATRIX_BROWSERS];
      const ps = platforms ?? [...MATRIX_PLATFORMS];
      const vs = viewports ?? [...MATRIX_VIEWPORTS];
      const combos: MatrixCombo[] = [];
      let skipped = 0;
      let bi = 0;
      while (bi < bs.length) {
        let pi = 0;
        while (pi < ps.length) {
          if (bs[bi] === 'safari' && ps[pi] === 'android') {
            skipped += vs.length;
            pi++;
            continue;
          }
          let vi = 0;
          while (vi < vs.length) {
            combos.push({ id: 'c' + (combos.length + 1), browser: bs[bi], platform: ps[pi], viewport: vs[vi] });
            vi++;
          }
          pi++;
        }
        bi++;
      }
      return { combos, skipped };
    };
    for (let c = 0; c < 500; c++) {
      let browsers: string[] | undefined;
      let platforms: string[] | undefined;
      let viewports: string[] | undefined;
      if (rand() < 0.7) browsers = MATRIX_BROWSERS.filter(() => rand() < 0.6);
      if (rand() < 0.7) platforms = MATRIX_PLATFORMS.filter(() => rand() < 0.6);
      if (rand() < 0.7) viewports = MATRIX_VIEWPORTS.filter(() => rand() < 0.6);
      const req: { browsers?: string[]; platforms?: string[]; viewports?: string[] } = {};
      if (browsers !== undefined) req.browsers = browsers;
      if (platforms !== undefined) req.platforms = platforms;
      if (viewports !== undefined) req.viewports = viewports;
      const verdict = planMatrix(req);
      const oracle = oraclePlan(browsers, platforms, viewports);
      if (oracle.refusal) {
        expect(verdict.ok).toBe(false);
        expect(verdict.reason).toBe(oracle.refusal);
        continue;
      }
      if (oracle.combos.length === 0) {
        expect(verdict.ok).toBe(false);
        expect(verdict.reason).toBe('matrix-combos-empty');
        continue;
      }
      expect(verdict.ok).toBe(true);
      expect(verdict.count).toBe(oracle.combos.length);
      expect(verdict.unsupportedSkipped).toBe(oracle.skipped);
      expect(verdict.combos).toEqual(oracle.combos);
      const results: Record<string, string> = {};
      let ep = 0;
      let ef = 0;
      let es = 0;
      for (const combo of oracle.combos) {
        const r = rand();
        const status = r < 0.7 ? 'pass' : r < 0.85 ? 'fail' : 'skip';
        results[combo.id] = status;
        if (status === 'pass') ep++;
        else if (status === 'fail') ef++;
        else es++;
      }
      const threshold = Math.floor(rand() * 101);
      const report = scoreMatrix({ combos: oracle.combos, results, threshold });
      const expCoverage = Number((((ep + ef) / oracle.combos.length) * 100).toFixed(2));
      expect(report.coverage).toBe(expCoverage);
      expect(report.passed).toBe(ep);
      expect(report.failed).toBe(ef);
      expect(report.skipped).toBe(es);
      expect(report.meets).toBe(expCoverage >= threshold && ef === 0);
    }
  });
});
