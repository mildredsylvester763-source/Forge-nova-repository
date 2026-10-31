// ============================================================================
// FILE: /apps/api/src/modules/ai-training/engine/model-access-engine.spec.ts
// ============================================================================
// Named vectors + 500-case mulberry32(42) sweeps + order-independence for the
// pure model-access engine (AI-045..047). Invariants: tier law per model,
// pin idempotence with switch-back trace, exact free-capacity arithmetic,
// card+license+weights mandatory for export, re-import passes the same gates,
// every refusal named, every fingerprint deterministic.

import {
  pinModel,
  unpinModel,
  resolvePinnedModel,
  reserveInstances,
  releaseInstances,
  buildOnPremPackage,
  verifyReimport,
  EXPORTABLE_STAGES,
  PACKAGE_FORMAT,
  PinPlan,
  ReservationPlan,
} from './model-access-engine';

const ok = (v: { ok: boolean } | null | undefined): boolean => !!v && v.ok === true;
const valueOf = <T,>(v: { ok: true; value: T } | { ok: false; reason: string }): T =>
  (v as { ok: true; value: T }).value;
const reasonOf = (v: { ok: false; reason: string }): string => v.reason;
const mulberry32 = (seed: number) => {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const djb2 = (s: string): string => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
};

describe('AI-045..047 model access engine (named vectors)', () => {
  it('pin: latest by default, tier law per model, idempotent re-pin, switch-back records the from-version', () => {
    const base = {
      workspaceId: 'ws1',
      modelId: 'm-1',
      modelTier: 'paid',
      planTiers: ['free', 'paid'],
      versions: [1, 2, 3],
    };
    const pinned = pinModel(base);
    expect(ok(pinned)).toBe(true);
    expect(valueOf(pinned)).toEqual({
      workspaceId: 'ws1',
      modelId: 'm-1',
      versionId: 3,
      modelTier: 'paid',
      switchedFrom: null,
      duplicate: false,
      fingerprint: 'pin_84867cb2',
    });
    const again = pinModel({ ...base, versionId: 3, existingPin: valueOf(pinned) });
    expect(ok(again)).toBe(true);
    expect(valueOf(again).duplicate).toBe(true);
    const switched = pinModel({ ...base, versionId: 2, existingPin: valueOf(pinned) });
    expect(valueOf(switched)).toEqual({
      workspaceId: 'ws1',
      modelId: 'm-1',
      versionId: 2,
      modelTier: 'paid',
      switchedFrom: 3,
      duplicate: false,
      fingerprint: 'pin_84867cb1',
    });
  });

  it('pin refusals are named: tier law, unknown version, empty registry', () => {
    const base = { workspaceId: 'ws1', modelId: 'm-1', planTiers: ['free', 'paid'], versions: [1, 2, 3] };
    expect(reasonOf(pinModel({ ...base, modelTier: 'restricted' } as any) as any)).toBe(
      'pin-tier-denied:restricted',
    );
    expect(reasonOf(pinModel({ ...base, modelTier: 'paid', versionId: 9 } as any) as any)).toBe(
      'pin-unknown-version:9',
    );
    expect(
      reasonOf(pinModel({ ...base, modelTier: 'paid', versions: [] } as any) as any),
    ).toBe('pin-no-versions:m-1');
  });

  it('unpin refuses when nothing is pinned, by name', () => {
    const unpinned = unpinModel({
      workspaceId: 'ws1',
      modelId: 'm-1',
      currentPin: {
        workspaceId: 'ws1',
        modelId: 'm-1',
        versionId: 3,
        modelTier: 'paid',
        switchedFrom: null,
        duplicate: false,
        fingerprint: 'pin_84867cb2',
      },
    });
    expect(valueOf(unpinned)).toEqual({ workspaceId: 'ws1', modelId: 'm-1', unpinnedVersionId: 3 });
    expect(
      reasonOf(unpinModel({ workspaceId: 'ws1', modelId: 'm-2', currentPin: null }) as any),
    ).toBe('unpin-not-pinned:ws1:m-2');
  });

  it('resolve prefers the pin and falls back explicitly', () => {
    const pin: PinPlan = {
      workspaceId: 'ws1',
      modelId: 'm-1',
      versionId: 3,
      modelTier: 'paid',
      switchedFrom: null,
      duplicate: false,
      fingerprint: 'pin_84867cb2',
    };
    expect(valueOf(resolvePinnedModel({ workspaceId: 'ws1', modelId: 'm-1', pins: [pin], fallbackVersionId: 1 })))
      .toEqual({ workspaceId: 'ws1', modelId: 'm-1', versionId: 3, source: 'pinned' });
    expect(
      valueOf(resolvePinnedModel({ workspaceId: 'ws1', modelId: 'm-2', pins: [], fallbackVersionId: 1 })),
    ).toEqual({ workspaceId: 'ws1', modelId: 'm-2', versionId: 1, source: 'fallback' });
    expect(reasonOf(resolvePinnedModel({ workspaceId: 'ws1', modelId: 'm-2', pins: [] }) as any)).toBe(
      'resolve-no-pinned:ws1:m-2',
    );
  });

  it('reserve: exclusive capacity with exact free arithmetic, idempotence, resize returns own slots first', () => {
    const r = reserveInstances({ workspaceId: 'ws1', modelId: 'm-1', slots: 4, poolTotal: 10, reservedByOthers: 3 });
    expect(valueOf(r)).toEqual({
      workspaceId: 'ws1',
      modelId: 'm-1',
      slots: 4,
      freeAfter: 3,
      duplicate: false,
      fingerprint: 'inst_84867cb3',
    });
    const dup = reserveInstances({
      workspaceId: 'ws1',
      modelId: 'm-1',
      slots: 4,
      poolTotal: 10,
      reservedByOthers: 3,
      currentReservation: valueOf(r),
    });
    expect(valueOf(dup).duplicate).toBe(true);
    const resized = reserveInstances({
      workspaceId: 'ws1',
      modelId: 'm-1',
      slots: 2,
      poolTotal: 10,
      reservedByOthers: 3,
      currentReservation: valueOf(r),
    });
    expect(valueOf(resized)).toEqual({
      workspaceId: 'ws1',
      modelId: 'm-1',
      slots: 2,
      freeAfter: 1,
      duplicate: false,
      fingerprint: 'inst_84867cb1',
    });
  });

  it('reserve refuses over-commit with exact free capacity in the refusal; release names the slots', () => {
    expect(
      reasonOf(reserveInstances({ workspaceId: 'ws1', modelId: 'm-1', slots: 8, poolTotal: 10, reservedByOthers: 3 }) as any),
    ).toBe('reserve-over-commit:8>7');
    const current: ReservationPlan = {
      workspaceId: 'ws1',
      modelId: 'm-1',
      slots: 4,
      freeAfter: 3,
      duplicate: false,
      fingerprint: 'inst_84867cb3',
    };
    expect(valueOf(releaseInstances({ workspaceId: 'ws1', modelId: 'm-1', currentReservation: current }))).toEqual({
      workspaceId: 'ws1',
      modelId: 'm-1',
      slotsReturned: 4,
      fingerprint: 'inst_84867cb3',
    });
    expect(reasonOf(releaseInstances({ workspaceId: 'ws1', modelId: 'm-2', currentReservation: null }) as any)).toBe(
      'release-not-reserved:ws1:m-2',
    );
  });

  it('package: only exportable stages leave, card+license+weights mandatory, format pinned, quantized distinct', () => {
    const pkg = buildOnPremPackage({
      modelId: 'm-1',
      versionId: 2,
      stage: 'beta',
      weightsFingerprint: 'w-1',
      hasCard: true,
      licenseTerms: 'enterprise-1.0',
      quantized: false,
    });
    expect(valueOf(pkg)).toEqual({
      modelId: 'm-1',
      versionId: 2,
      format: PACKAGE_FORMAT,
      weightsFingerprint: 'w-1',
      quantized: false,
      licenseTerms: 'enterprise-1.0',
      fingerprint: 'xpk_d4123481',
    });
    const quantized = buildOnPremPackage({
      modelId: 'm-1',
      versionId: 2,
      stage: 'stable',
      weightsFingerprint: 'w-1',
      hasCard: true,
      licenseTerms: 'enterprise-1.0',
      quantized: true,
    });
    expect(valueOf(quantized).fingerprint).toBe('xpk_8a561756');
    expect(valueOf(quantized).fingerprint).not.toBe(valueOf(pkg).fingerprint);
    expect(reasonOf(buildOnPremPackage({ modelId: 'm-1', versionId: 2, stage: 'experimental', weightsFingerprint: 'w-1', hasCard: true, licenseTerms: 'x' }) as any)).toBe(
      'package-not-servable:experimental',
    );
    expect(reasonOf(buildOnPremPackage({ modelId: 'm-1', versionId: 2, stage: 'beta', weightsFingerprint: 'w-1', hasCard: false, licenseTerms: 'x' }) as any)).toBe(
      'package-no-card:m-1',
    );
    expect(reasonOf(buildOnPremPackage({ modelId: 'm-1', versionId: 2, stage: 'beta', weightsFingerprint: '', hasCard: true, licenseTerms: 'x' }) as any)).toBe(
      'package-no-weights',
    );
    expect(reasonOf(buildOnPremPackage({ modelId: 'm-1', versionId: 2, stage: 'beta', weightsFingerprint: 'w-1', hasCard: true, licenseTerms: '' }) as any)).toBe(
      'package-no-license',
    );
  });

  it('reimport passes the same gates: weights, quality, license — each refusal named', () => {
    const pkg = valueOf(
      buildOnPremPackage({
        modelId: 'm-1',
        versionId: 2,
        stage: 'beta',
        weightsFingerprint: 'w-1',
        hasCard: true,
        licenseTerms: 'enterprise-1.0',
      }),
    );
    expect(valueOf(verifyReimport({ pkg, weightsFingerprint: 'w-1', qualityScore: 0.92, qualityGate: 0.9, licenseAccepted: true })))
      .toEqual({ accepted: true, fingerprint: 'xpk_d4123481', modelId: 'm-1', versionId: 2 });
    expect(
      reasonOf(verifyReimport({ pkg, weightsFingerprint: 'w-1', qualityScore: 0.89, qualityGate: 0.9, licenseAccepted: true }) as any),
    ).toBe('reimport-quality-gate:0.89<0.9');
    expect(
      reasonOf(verifyReimport({ pkg, weightsFingerprint: 'w-9', qualityScore: 0.95, qualityGate: 0.9, licenseAccepted: true }) as any),
    ).toBe('reimport-weights-mismatch:w-9!=w-1');
    expect(
      reasonOf(verifyReimport({ pkg, weightsFingerprint: 'w-1', qualityScore: 0.95, qualityGate: 0.9, licenseAccepted: false }) as any),
    ).toBe('reimport-license-not-accepted');
    expect(EXPORTABLE_STAGES).toEqual(['beta', 'stable']);
  });
});

describe('AI-045..047 model access engine (500-case sweeps, mulberry32(42))', () => {
  it('pin sweep: tier law exact, version always registered, fingerprints stable, re-pin idempotent', () => {
    const rnd = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const versions = Array.from({ length: 1 + Math.floor(rnd() * 5) }, (_, k) => k + 1);
      const tier = ['free', 'paid', 'restricted'][Math.floor(rnd() * 3)];
      const planTiers = rnd() < 0.5 ? ['free', 'paid', 'restricted'] : ['free'];
      const withVer = rnd() < 0.7;
      const v = pinModel({
        workspaceId: 'w' + i,
        modelId: 'm' + i,
        modelTier: tier,
        planTiers,
        versions,
        versionId: withVer ? versions[Math.floor(rnd() * versions.length)] : undefined,
      });
      if (!ok(v)) {
        expect(reasonOf(v as any)).toBe('pin-tier-denied:' + tier);
        continue;
      }
      const p = valueOf(v);
      expect(versions).toContain(p.versionId);
      expect(p.fingerprint).toBe('pin_' + djb2('w' + i + ':m' + i + ':' + p.versionId));
      const again = pinModel({
        workspaceId: 'w' + i,
        modelId: 'm' + i,
        modelTier: tier,
        planTiers,
        versions,
        versionId: p.versionId,
        existingPin: p,
      });
      expect(ok(again)).toBe(true);
      expect(valueOf(again).duplicate).toBe(true);
    }
  });

  it('reserve sweep: over-commit refused with exact free arithmetic, freeAfter never negative', () => {
    const rnd = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const poolTotal = 1 + Math.floor(rnd() * 20);
      const reservedByOthers = Math.floor(rnd() * poolTotal);
      const slots = 1 + Math.floor(rnd() * poolTotal);
      const v = reserveInstances({ workspaceId: 'w' + i, modelId: 'm' + i, slots, poolTotal, reservedByOthers });
      const free = poolTotal - reservedByOthers;
      if (!ok(v)) {
        expect(reasonOf(v as any)).toBe('reserve-over-commit:' + slots + '>' + free);
      } else {
        const r = valueOf(v);
        expect(r.freeAfter).toBe(free - slots);
        expect(r.freeAfter).toBeGreaterThanOrEqual(0);
        expect(r.fingerprint).toBe('inst_' + djb2('w' + i + ':m' + i + ':' + slots));
      }
    }
  });

  it('package sweep: refusal reasons match the first missing gate exactly', () => {
    const rnd = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const stage = ['experimental', 'beta', 'stable'][Math.floor(rnd() * 3)];
      const hasCard = rnd() < 0.8;
      const licenseTerms = rnd() < 0.8 ? 'l' + i : '';
      const v = buildOnPremPackage({
        modelId: 'm' + i,
        versionId: 1,
        stage,
        weightsFingerprint: 'w',
        hasCard,
        licenseTerms,
        quantized: rnd() < 0.5,
      });
      if (!ok(v)) {
        const r = reasonOf(v as any);
        if (stage !== 'beta' && stage !== 'stable') {
          expect(r).toBe('package-not-servable:' + stage);
        } else if (!hasCard) {
          expect(r).toBe('package-no-card:m' + i);
        } else {
          expect(r).toBe('package-no-license');
        }
      } else {
        const g = valueOf(v);
        expect(g.format).toBe(PACKAGE_FORMAT);
        expect(g.fingerprint).toBe('xpk_' + djb2('m' + i + ':1:' + g.quantized));
      }
    }
  });

  it('reimport sweep: acceptance only when every gate passes, resolve is order-independent', () => {
    const rnd = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const g = valueOf(
        buildOnPremPackage({
          modelId: 'm' + i,
          versionId: 1,
          stage: 'stable',
          weightsFingerprint: 'w',
          hasCard: true,
          licenseTerms: 'l' + i,
          quantized: rnd() < 0.5,
        }),
      );
      const score = Math.round(rnd() * 1e6) / 1e6;
      const gate = Math.round(rnd() * 1e6) / 1e6;
      const lic = rnd() < 0.7;
      const wmatch = rnd() < 0.8;
      const v = verifyReimport({
        pkg: g,
        weightsFingerprint: wmatch ? 'w' : 'w2',
        qualityScore: score,
        qualityGate: gate,
        licenseAccepted: lic,
      });
      if (ok(v)) {
        expect(score).toBeGreaterThanOrEqual(gate);
        expect(wmatch).toBe(true);
        expect(lic).toBe(true);
      } else {
        const r = reasonOf(v as any);
        if (!wmatch) {
          expect(r).toBe('reimport-weights-mismatch:w2!=w');
        } else if (score < gate) {
          expect(r).toBe('reimport-quality-gate:' + score + '<' + gate);
        } else {
          expect(r).toBe('reimport-license-not-accepted');
        }
      }
      // order-independence: pins in any order resolve identically
      const pin: PinPlan = {
        workspaceId: 'wz',
        modelId: 'mz',
        versionId: 2,
        modelTier: 'free',
        switchedFrom: null,
        duplicate: false,
        fingerprint: 'pin_' + djb2('wz:mz:2'),
      };
      const decoy: PinPlan = { ...pin, fingerprint: 'pin_zzzzzzzz' };
      const a = resolvePinnedModel({ workspaceId: 'wz', modelId: 'mz', pins: [pin, decoy], fallbackVersionId: 9 });
      const b = resolvePinnedModel({ workspaceId: 'wz', modelId: 'mz', pins: [decoy, pin], fallbackVersionId: 9 });
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });
});
