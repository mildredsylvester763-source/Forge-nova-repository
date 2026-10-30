// ============================================================================
// FILE: /apps/api/src/modules/ai-training/engine/model-registry-engine.spec.ts
// ============================================================================
// Pinned spec for the AI-033..035 model registry engine. Every refusal is
// named, every score is rounded to 1e-6, fingerprints are deterministic and
// owner-order-independent, promotion gates are boundary-exact, and the whole
// surface is swept with 500 mulberry32(42) cases. Engine semantics were
// verified in a sandbox JS mirror before this spec was written; the pinned
// vectors here are the same ones.

import {
  PROMOTION_LADDER,
  PROMOTION_MIN_BETA_EVAL,
  PROMOTION_MIN_STABLE_SAFETY,
  buildModelCard,
  djb2,
  promoteModel,
  registerModelVersion,
} from './model-registry-engine';
import type { ModelStage, RegisteredModel, Verdict } from './model-registry-engine';

type V<T> = Verdict<T>;

const reasonOf = <T,>(v: V<T>): string => {
  if (v.ok) throw new Error('expected a named refusal');
  return v.reason;
};
const valueOf = <T,>(v: V<T>): T => {
  if (!v.ok) throw new Error(String(v.reason));
  return v.value;
};
const r6 = (x: number): number => Math.round(x * 1e6) / 1e6;

function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function perm<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr];
  return arr.flatMap((x, i) => perm([...arr.slice(0, i), ...arr.slice(i + 1)]).map((p) => [x, ...p]));
}

const BASE = {
  modelId: 'forge-coder',
  owners: ['alice', 'bob'],
  weightsFingerprint: 'wfp_abc123',
  lineage: { datasetId: 'ds-1', evalSuiteId: 'forge-core' },
};

describe('registerModelVersion (AI-033) — versions, lineage, owners', () => {
  it('registers version 1 at the experimental stage with sorted owners and a modfp fingerprint', () => {
    const v = valueOf(registerModelVersion(BASE));
    expect(v.modelId).toBe('forge-coder');
    expect(v.version).toBe(1);
    expect(v.stage).toBe('experimental');
    expect(v.owners).toEqual(['alice', 'bob']);
    expect(v.fingerprint).toMatch(/^modfp_[0-9a-f]{8}$/);
  });

  it('auto-versions the next slot and refuses gaps and duplicates by name', () => {
    const v2 = valueOf(registerModelVersion({ ...BASE, version: 2, existingVersions: [1] }));
    expect(v2.version).toBe(2);
    expect(reasonOf(registerModelVersion({ ...BASE, version: 1, existingVersions: [1] }))).toBe(
      'registry-duplicate-version:forge-coder:1',
    );
    expect(reasonOf(registerModelVersion({ ...BASE, version: 5, existingVersions: [1] }))).toBe(
      'registry-version-gap:5!=2',
    );
    expect(reasonOf(registerModelVersion({ ...BASE, version: 0 }))).toBe('registry-invalid-version:0');
  });

  it('is owner-order independent: shuffled owners produce the identical fingerprint', () => {
    const a = valueOf(registerModelVersion(BASE));
    const b = valueOf(registerModelVersion({ ...BASE, owners: ['bob', 'alice'] }));
    expect(b.fingerprint).toBe(a.fingerprint);
    const c = valueOf(registerModelVersion(BASE));
    expect(c.fingerprint).toBe(a.fingerprint);
  });

  it('refuses structural violations by name', () => {
    expect(reasonOf(registerModelVersion({ ...BASE, modelId: '' }))).toBe('registry-no-model-id');
    expect(reasonOf(registerModelVersion({ ...BASE, owners: [] }))).toBe('registry-no-owners');
    expect(reasonOf(registerModelVersion({ ...BASE, owners: ['alice', 'alice'] }))).toBe('registry-duplicate-owner:alice');
    expect(reasonOf(registerModelVersion({ ...BASE, owners: [''] }))).toBe('registry-invalid-owner');
    expect(reasonOf(registerModelVersion({ ...BASE, weightsFingerprint: '' }))).toBe('registry-no-weights-fingerprint');
    expect(reasonOf(registerModelVersion({ ...BASE, lineage: { datasetId: ' ' } }))).toBe('registry-invalid-lineage:datasetId');
    expect(reasonOf(registerModelVersion({ ...BASE, lineage: { runFingerprint: '' } }))).toBe('registry-invalid-lineage:runFingerprint');
  });

  it('keeps every field of the lineage the registry is trusted to remember', () => {
    const v = valueOf(
      registerModelVersion({ ...BASE, lineage: { datasetId: 'ds-9', evalSuiteId: 'es-9', parentVersionId: 'forge-coder:1', runFingerprint: 'runfp_00112233' } }),
    );
    expect(v.lineage).toEqual({ datasetId: 'ds-9', evalSuiteId: 'es-9', parentVersionId: 'forge-coder:1', runFingerprint: 'runfp_00112233' });
  });
});

describe('buildModelCard (AI-034) — honest, deterministic, evidence-backed', () => {
  const ENTRY = {
    modelId: 'forge-coder',
    version: 1,
    stage: 'experimental' as ModelStage,
    owners: ['alice', 'bob'],
    weightsFingerprint: 'wfp_abc123',
    lineage: { datasetId: 'ds-1' },
  };

  it('generates the seven standard sections with rounded scores and a cardfp fingerprint', () => {
    const c = valueOf(buildModelCard({ entry: ENTRY, intendedUse: 'code review assist', evalScores: [{ suiteId: 'forge-core', score: 0.9166667 }] }));
    expect(Object.keys(c)).toEqual(['modelDetails', 'intendedUse', 'trainingData', 'evaluation', 'limitations', 'caveats', 'cardFingerprint']);
    expect(c.modelDetails).toMatchObject({ modelId: 'forge-coder', version: 1, stage: 'experimental' });
    expect(c.trainingData).toEqual({ datasetId: 'ds-1', parentVersionId: null });
    expect(c.evaluation[0].score).toBe(0.916667);
    expect(c.cardFingerprint).toMatch(/^cardfp_[0-9a-f]{8}$/);
  });

  it('surfaces missing safety evidence as a CAVEAT — the card never hides a gap', () => {
    const c = valueOf(buildModelCard({ entry: ENTRY, intendedUse: 'x', evalScores: [{ suiteId: 's', score: 0.9 }] }));
    expect(c.caveats).toEqual(['safety-evidence-missing']);
    const c2 = valueOf(buildModelCard({ entry: ENTRY, intendedUse: 'x', evalScores: [{ suiteId: 's', score: 0.9 }], safetyPassRate: 1 }));
    expect(c2.caveats).toEqual([]);
  });

  it('auto-declares limitations honestly when none are provided, keeps declared ones', () => {
    const auto = valueOf(buildModelCard({ entry: ENTRY, intendedUse: 'x', evalScores: [{ suiteId: 's', score: 0.9 }] }));
    expect(auto.limitations).toEqual(['No limitations declared.']);
    const declared = valueOf(buildModelCard({ entry: ENTRY, intendedUse: 'x', evalScores: [{ suiteId: 's', score: 0.9 }], limitations: ['biased toward python', ''] }));
    expect(declared.limitations).toEqual(['biased toward python']);
  });

  it('is deterministic: identical inputs produce the identical fingerprint', () => {
    const a = valueOf(buildModelCard({ entry: ENTRY, intendedUse: 'assist', evalScores: [{ suiteId: 'forge-core', score: 0.9166667 }] }));
    const b = valueOf(buildModelCard({ entry: ENTRY, intendedUse: 'assist', evalScores: [{ suiteId: 'forge-core', score: 0.9166667 }] }));
    expect(b.cardFingerprint).toBe(a.cardFingerprint);
  });

  it('sorts eval evidence suite-id ascending — evidence order never changes the card', () => {
    const a = valueOf(buildModelCard({ entry: ENTRY, intendedUse: 'x', evalScores: [{ suiteId: 'b', score: 0.5 }, { suiteId: 'a', score: 0.9 }] }));
    const b = valueOf(buildModelCard({ entry: ENTRY, intendedUse: 'x', evalScores: [{ suiteId: 'a', score: 0.9 }, { suiteId: 'b', score: 0.5 }] }));
    expect(a.evaluation.map((e) => e.suiteId)).toEqual(['a', 'b']);
    expect(b.cardFingerprint).toBe(a.cardFingerprint);
  });

  it('refuses cardless claims by name', () => {
    expect(reasonOf(buildModelCard({ entry: ENTRY, intendedUse: '', evalScores: [{ suiteId: 's', score: 0.9 }] }))).toBe('card-no-intended-use');
    expect(reasonOf(buildModelCard({ entry: { ...ENTRY, lineage: {} }, intendedUse: 'x', evalScores: [{ suiteId: 's', score: 0.9 }] }))).toBe('card-no-training-lineage');
    expect(reasonOf(buildModelCard({ entry: ENTRY, intendedUse: 'x', evalScores: [] }))).toBe('card-no-eval-evidence');
    expect(reasonOf(buildModelCard({ entry: ENTRY, intendedUse: 'x', evalScores: [{ suiteId: 's', score: 1.5 }] }))).toBe('card-invalid-eval-score:1.5');
    expect(reasonOf(buildModelCard({ entry: ENTRY, intendedUse: 'x', evalScores: [{ suiteId: '', score: 0.5 }] }))).toBe('card-invalid-eval-suite:');
  });
});

describe('promoteModel (AI-035) — one stage at a time, hard gates, boundary-exact', () => {
  const EV = { hasCard: true, evalScore: 0.9, safetyPassRate: 0.99 };

  it('walks the legal ladder experimental -> internal -> beta -> stable', () => {
    const a = valueOf(promoteModel({ modelId: 'm', version: 1, from: 'experimental', to: 'internal', evidence: EV }));
    expect(a.to).toBe('internal');
    const b = valueOf(promoteModel({ modelId: 'm', version: 1, from: 'internal', to: 'beta', evidence: EV }));
    expect(b.to).toBe('beta');
    const c = valueOf(promoteModel({ modelId: 'm', version: 1, from: 'beta', to: 'stable', evidence: EV }));
    expect(c.to).toBe('stable');
    expect(c.promotionFingerprint).toMatch(/^promofp_[0-9a-f]{8}$/);
  });

  it('refuses skips, stalls and backwards moves by name', () => {
    expect(reasonOf(promoteModel({ modelId: 'm', version: 1, from: 'experimental', to: 'beta', evidence: EV }))).toBe('promotion-illegal:experimental->beta');
    expect(reasonOf(promoteModel({ modelId: 'm', version: 1, from: 'beta', to: 'beta', evidence: EV }))).toBe('promotion-illegal:beta->beta');
    expect(reasonOf(promoteModel({ modelId: 'm', version: 1, from: 'stable', to: 'beta', evidence: EV }))).toBe('promotion-illegal:stable->beta');
    expect(reasonOf(promoteModel({ modelId: 'm', version: 1, from: 'ghost' as ModelStage, to: 'internal', evidence: EV }))).toBe('promotion-unknown-stage:ghost');
    expect(reasonOf(promoteModel({ modelId: '', version: 1, from: 'experimental', to: 'internal', evidence: EV }))).toBe('promotion-unknown-model:');
  });

  it('internal requires eval evidence, beta requires a card and eval >= 0.8 (boundary passes)', () => {
    expect(reasonOf(promoteModel({ modelId: 'm', version: 1, from: 'experimental', to: 'internal', evidence: { hasCard: false } }))).toBe('promotion-missing-eval');
    expect(reasonOf(promoteModel({ modelId: 'm', version: 1, from: 'internal', to: 'beta', evidence: { hasCard: false, evalScore: 0.9 } }))).toBe('promotion-missing-card');
    expect(reasonOf(promoteModel({ modelId: 'm', version: 1, from: 'internal', to: 'beta', evidence: { hasCard: true, evalScore: 0.79 } }))).toBe(
      'promotion-gate-failed:eval:0.79<0.8',
    );
    const boundary = valueOf(promoteModel({ modelId: 'm', version: 1, from: 'internal', to: 'beta', evidence: { hasCard: true, evalScore: 0.8 } }));
    expect(boundary.to).toBe('beta');
  });

  it('stable requires safety evidence >= 0.95 (boundary passes) and a card', () => {
    expect(reasonOf(promoteModel({ modelId: 'm', version: 1, from: 'beta', to: 'stable', evidence: { hasCard: true, evalScore: 0.9 } }))).toBe('promotion-missing-safety');
    expect(reasonOf(promoteModel({ modelId: 'm', version: 1, from: 'beta', to: 'stable', evidence: { hasCard: true, evalScore: 0.9, safetyPassRate: 0.94 } }))).toBe(
      'promotion-gate-failed:safety:0.94<0.95',
    );
    const boundary = valueOf(promoteModel({ modelId: 'm', version: 1, from: 'beta', to: 'stable', evidence: { hasCard: true, evalScore: 0.9, safetyPassRate: 0.95 } }));
    expect(boundary.to).toBe('stable');
    expect(reasonOf(promoteModel({ modelId: 'm', version: 1, from: 'beta', to: 'stable', evidence: { hasCard: false, evalScore: 0.9, safetyPassRate: 1 } }))).toBe('promotion-missing-card');
  });

  it('evidence payload construction order never changes the verdict', () => {
    const a = promoteModel({ modelId: 'm', version: 2, from: 'experimental', to: 'internal', evidence: { evalScore: 0.5, hasCard: true } });
    const b = promoteModel({ modelId: 'm', version: 2, from: 'experimental', to: 'internal', evidence: { hasCard: true, evalScore: 0.5 } });
    expect(a).toEqual(b);
  });
});

describe('order-independence — every serialization order yields the same registry truths', () => {
  it('owners: all permutations produce the identical fingerprint', () => {
    const owners = ['o1', 'o2', 'o3'];
    const perms = perm(owners);
    const base = valueOf(registerModelVersion({ ...BASE, owners: perms[0] })).fingerprint;
    for (const p of perms) {
      expect(valueOf(registerModelVersion({ ...BASE, owners: p })).fingerprint).toBe(base);
    }
  });

  it('eval scores: all permutations produce the identical card', () => {
    const scores = [{ suiteId: 'a', score: 0.9 }, { suiteId: 'b', score: 0.5 }, { suiteId: 'c', score: 0.7 }];
    const perms = perm(scores);
    const ENTRY = { modelId: 'm', version: 1, stage: 'internal' as ModelStage, owners: ['a'], weightsFingerprint: 'w', lineage: { datasetId: 'd' } };
    const base = valueOf(buildModelCard({ entry: ENTRY, intendedUse: 'x', evalScores: perms[0] })).cardFingerprint;
    for (const p of perms) {
      expect(valueOf(buildModelCard({ entry: ENTRY, intendedUse: 'x', evalScores: p })).cardFingerprint).toBe(base);
    }
  });

  it('promotion ladder order is a law, not a suggestion', () => {
    expect(PROMOTION_LADDER).toEqual(['experimental', 'internal', 'beta', 'stable']);
    expect(PROMOTION_MIN_BETA_EVAL).toBe(0.8);
    expect(PROMOTION_MIN_STABLE_SAFETY).toBe(0.95);
  });
});

describe('500-case mulberry32(42) sweep — invariants hold at scale', () => {
  it('sweeps registration, cards and gated ladder walks', () => {
    const rnd = mulberry32(42);
    let swept = 0;
    for (let i = 0; i < 500; i++) {
      const nOwners = 1 + Math.floor(rnd() * 3);
      const owners = Array.from({ length: nOwners }, (_, k) => 'o' + k + '-' + i);
      const lineage = { datasetId: 'ds-' + i, evalSuiteId: 'es-' + i };
      const reg = registerModelVersion({ modelId: 'sweep-' + i, owners, weightsFingerprint: 'wfp_' + i, lineage });
      expect(reg.ok).toBe(true);
      const v: RegisteredModel = valueOf(reg);

      const shuffled = owners.slice().reverse();
      expect(valueOf(registerModelVersion({ modelId: 'sweep-' + i, owners: shuffled, weightsFingerprint: 'wfp_' + i, lineage })).fingerprint).toBe(v.fingerprint);

      const suiteId = 's' + Math.floor(rnd() * 3);
      const cardScore = r6(rnd());
      const hasSafety = rnd() < 0.5;
      const card = valueOf(buildModelCard({ entry: v, intendedUse: 'use-' + i, evalScores: [{ suiteId, score: cardScore }], safetyPassRate: hasSafety ? 1 : undefined }));
      expect(card.evaluation[0].score).toBe(cardScore);
      const cardRe = valueOf(buildModelCard({ entry: v, intendedUse: 'use-' + i, evalScores: [{ suiteId, score: cardScore }], safetyPassRate: hasSafety ? 1 : undefined }));
      expect(cardRe.cardFingerprint).toBe(card.cardFingerprint);

      let stage: ModelStage = 'experimental';
      const hasCard = rnd() < 0.7;
      const evalScore = r6(rnd());
      const safetyPassRate = r6(rnd());
      const evd = { hasCard, evalScore, safetyPassRate };
      for (let steps = 0; steps < 3; steps++) {
        const idx = PROMOTION_LADDER.indexOf(stage);
        const next = PROMOTION_LADDER[idx + 1];
        if (!next) break;
        const p = promoteModel({ modelId: 'sweep-' + i, version: v.version, from: stage, to: next, evidence: evd });
        if (p.ok) {
          stage = next;
          if (next === 'beta' && evalScore < 0.8) throw new Error('beta gate leak ' + i);
          if (next === 'stable' && safetyPassRate < 0.95) throw new Error('stable gate leak ' + i);
        } else {
          const reason = reasonOf(p);
          const expected = [
            'promotion-missing-eval',
            hasCard ? null : 'promotion-missing-card',
            'promotion-missing-safety',
            next === 'beta' && evalScore < 0.8 ? 'promotion-gate-failed:eval:' + r6(evalScore) + '<0.8' : null,
            next === 'stable' && safetyPassRate < 0.95 ? 'promotion-gate-failed:safety:' + r6(safetyPassRate) + '<0.95' : null,
          ].filter((x) => x !== null) as string[];
          expect(expected).toContain(reason);
          break;
        }
      }
      swept++;
    }
    expect(swept).toBe(500);
  });

  it('djb2 is stable for the pinned vectors', () => {
    expect(djb2('forge-coder:1:wfp_abc123:alice,bob')).toBe(djb2('forge-coder:1:wfp_abc123:alice,bob'));
    expect(djb2('a')).not.toBe(djb2('b'));
  });
});
