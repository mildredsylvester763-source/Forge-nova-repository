import { RESEARCH_STEPS, buildResearchReport, planResearch } from './research-mode';

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

describe('research mode engine AI-066', () => {
  it('pins the plan refusal catalog', () => {
    expect(planResearch({ topic: '  ' })).toEqual({ ok: false, reason: 'research-topic-missing' });
    expect(planResearch({ topic: 'payments', steps: ['search', 'reflect'] })).toEqual({
      ok: false,
      reason: 'research-step-unknown:reflect',
    });
    expect(planResearch({ topic: 'payments', steps: ['search', 'search'] })).toEqual({
      ok: false,
      reason: 'research-step-duplicate:search',
    });
    expect(planResearch({ topic: 'payments', steps: ['read', 'search'] })).toEqual({
      ok: false,
      reason: 'research-steps-out-of-order',
    });
    expect(planResearch({ topic: 'payments', steps: 'search' as never })).toEqual({
      ok: false,
      reason: 'research-steps-not-array',
    });
  });

  it('pins the plan laws', () => {
    expect(planResearch({ topic: 'payments' })).toEqual({
      ok: true,
      topic: 'payments',
      steps: ['search', 'read', 'cross-check', 'draft'],
      stepCount: 4,
    });
    expect(planResearch({ topic: 'payments', steps: ['Search', 'DRAFT'] })).toEqual({
      ok: true,
      topic: 'payments',
      steps: ['search', 'draft'],
      stepCount: 2,
    });
  });

  it('pins the report refusal and verification laws', () => {
    expect(buildResearchReport({ topic: 'payments', findings: [] })).toEqual({
      ok: false,
      reason: 'research-findings-empty',
    });
    expect(buildResearchReport({ topic: 'payments', findings: [{ claim: '  ', sources: ['a'] }] })).toEqual({
      ok: false,
      reason: 'research-claim-missing',
    });
    expect(buildResearchReport({ topic: 'payments', findings: [{ claim: 'x', sources: [] }] })).toEqual({
      ok: false,
      reason: 'research-source-missing',
    });
    expect(
      buildResearchReport({ topic: 'payments', findings: [{ claim: 'x', sources: ['a', ' '] }] }),
    ).toEqual({ ok: false, reason: 'research-source-blank' });
    expect(
      buildResearchReport({
        topic: 'payments',
        findings: [{ claim: 'x', sources: ['a', 'b'] }],
        openQuestions: [' '],
      }),
    ).toEqual({ ok: false, reason: 'research-question-blank' });
    const rep = buildResearchReport({
      topic: 'payments',
      findings: [
        { claim: 'Refunds take 5 days', sources: ['doc-1', 'issue-7'] },
        { claim: 'Charges are idempotent', sources: ['doc-2'] },
      ],
      openQuestions: ['Why do edge refunds retry?'],
    });
    expect(rep.summary).toBe('Investigation of payments with 2 findings');
    expect(rep.findings?.map((f) => f.verified)).toEqual([true, false]);
    expect([rep.verifiedCount, rep.unverifiedCount]).toEqual([1, 1]);
    expect(rep.openQuestions).toEqual(['Why do edge refunds retry?']);
  });

  it('sweeps 500 seeded cases against an independent oracle', () => {
    const rnd = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const topicRoll = rnd();
      const topic = topicRoll < 0.05 ? '   ' : 'topic ' + Math.floor(rnd() * 5);
      const stepCount = Math.floor(rnd() * 6);
      const steps: string[] = [];
      for (let s = 0; s < stepCount; s++) {
        const pick = Math.floor(rnd() * 6);
        steps.push(pick === 5 ? 'reflect' : RESEARCH_STEPS[pick]);
      }
      const findingCount = 1 + Math.floor(rnd() * 3);
      const findings: { claim: string; sources: string[] }[] = [];
      for (let f = 0; f < findingCount; f++) {
        const claimRoll = rnd();
        const srcCount = Math.floor(rnd() * 3);
        const sources: string[] = [];
        for (let s2 = 0; s2 < srcCount; s2++) {
          sources.push(rnd() < 0.05 ? '' : 'src-' + s2);
        }
        findings.push({ claim: claimRoll < 0.05 ? '  ' : 'claim ' + f, sources });
      }
      const plan = planResearch({ topic, steps: stepCount === 0 ? undefined : steps });
      const report = buildResearchReport({ topic, findings });
      const t = typeof topic === 'string' ? topic.trim() : '';
      const known = steps.every((s) => RESEARCH_STEPS.includes(s));
      const uniqueSteps = new Set(steps).size === steps.length;
      const orderOk = steps
        .map((s) => RESEARCH_STEPS.indexOf(s))
        .every((v, idx, arr) => idx === 0 || v >= arr[idx - 1]);
      const planOk = t.length > 0 && (stepCount === 0 || (known && uniqueSteps && orderOk));
      expect(plan.ok).toBe(planOk);
      const repOk =
        t.length > 0 &&
        findings.every(
          (f) =>
            typeof f.claim === 'string' &&
            f.claim.trim().length > 0 &&
            Array.isArray(f.sources) &&
            f.sources.length > 0 &&
            f.sources.every((s) => typeof s === 'string' && s.trim().length > 0),
        );
      expect(report.ok).toBe(repOk);
      if (repOk) {
        const vc = findings.filter((f) => f.sources.length >= 2).length;
        expect(report.verifiedCount).toBe(vc);
        expect(report.findings?.length).toBe(findings.length);
      }
    }
  });
});
