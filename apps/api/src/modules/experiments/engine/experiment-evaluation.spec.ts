import { evaluateExperiment, MIN_VISITORS_PER_ARM, ExperimentArm } from './experiment-evaluation';

const V = 1000;
const arm = (visitors: number, conversions: number): ExperimentArm => ({ visitors, conversions });

describe('evaluateExperiment pinned vectors', () => {
  it('wins on a clear lift above threshold', () => {
    const r = evaluateExperiment(arm(V, 100), arm(V, 130), 0.1);
    expect(r.verdict).toBe('win');
    expect(r.relativeLift).toBeCloseTo(0.3, 4);
  });

  it('loses on a clear negative lift', () => {
    const r = evaluateExperiment(arm(V, 100), arm(V, 70), 0.1);
    expect(r.verdict).toBe('lose');
    expect(r.relativeLift).toBeCloseTo(-0.3, 4);
  });

  it('inconclusive inside the indifference band', () => {
    const r = evaluateExperiment(arm(V, 100), arm(V, 105), 0.1);
    expect(r.verdict).toBe('inconclusive');
    expect(r.reasons[0]).toContain('indifference');
  });

  it('refuses to judge below the minimum sample — even on a huge lift', () => {
    const r = evaluateExperiment(arm(10, 5), arm(10, 10), 0.1);
    expect(r.verdict).toBe('inconclusive');
    expect(r.reasons[0]).toContain('Sample too small');
  });

  it('refuses to judge when an arm has no visitors or conversions > visitors', () => {
    expect(evaluateExperiment(arm(0, 0), arm(V, 100), 0.1).verdict).toBe('inconclusive');
    expect(evaluateExperiment(arm(V, 150), arm(V, 100), 0.1).verdict).toBe('inconclusive');
  });

  it('absolute win when baseline converted nobody', () => {
    const r = evaluateExperiment(arm(V, 0), arm(V, 5), 0.1);
    expect(r.verdict).toBe('win');
    expect(r.reasons[0]).toContain('absolute win');
  });

  it('inconclusive when neither arm converted anybody', () => {
    const r = evaluateExperiment(arm(V, 0), arm(V, 0), 0.1);
    expect(r.verdict).toBe('inconclusive');
  });
});

describe('evaluateExperiment invariants', () => {
  function mulberry32(seed: number) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rand = mulberry32(737373);
  const vectors: ExperimentArm[][] = [];
  for (let i = 0; i < 1000; i++) {
    vectors.push([
      { visitors: Math.floor(rand() * 200), conversions: Math.floor(rand() * 200) },
      { visitors: Math.floor(rand() * 200), conversions: Math.floor(rand() * 200) },
    ]);
  }

  it('never violates its own rules across 1000 seeded vectors', () => {
    for (const [b, v] of vectors) {
      const r = evaluateExperiment(b, v, 0.1);
      expect(['win', 'lose', 'inconclusive']).toContain(r.verdict);
      expect(r.reasons.length).toBeGreaterThan(0);
      const valid = b.visitors >= MIN_VISITORS_PER_ARM && v.visitors >= MIN_VISITORS_PER_ARM
        && b.conversions <= b.visitors && v.conversions <= v.visitors && b.visitors > 0 && v.visitors > 0;
      if (!valid) {
        expect(r.verdict).toBe('inconclusive');
      } else {
        const bRate = b.conversions / b.visitors;
        const vRate = v.conversions / v.visitors;
        if (r.verdict === 'win' && bRate > 0) {
          expect((vRate - bRate) / bRate).toBeGreaterThanOrEqual(0.1 - 1e-9);
        }
        if (r.verdict === 'lose' && bRate > 0) {
          expect((vRate - bRate) / bRate).toBeLessThanOrEqual(-0.1 + 1e-9);
        }
      }
    }
  });

  it('is deterministic', () => {
    const a = evaluateExperiment(arm(V, 100), arm(V, 120), 0.1);
    const b = evaluateExperiment(arm(V, 100), arm(V, 120), 0.1);
    expect(a).toEqual(b);
  });
});
