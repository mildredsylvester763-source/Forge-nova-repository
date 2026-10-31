// ============================================================================
// FILE: /apps/api/src/modules/ai-training/ai-training-access.functional.spec.ts
// ============================================================================
// Service-level lifecycle + adversarial scenarios for workspace model access
// (FORGE AI-045..047): per-workspace version pinning with the switch-back
// trace (GP-016), per-model tier law (MT-104), dedicated instances with
// exact free-capacity arithmetic over the shared pool, and on-prem packages
// that only leave with card, license and weights attached — re-import passes
// the same gates that allowed export. Every refusal is named; a refused
// operation stores nothing; pins and reservations are idempotent. Zero-trust
// throughout: one user never sees another user's pins, reservations or
// packages.

import { AiTrainingService } from './ai-training.service';

/** Test double for a TypeORM repository. Id-upsert save, where filters,
 *  order support (createdAt ASC), findOne, remove. */
class RepoDouble<T> {
  rows: T[] = [];
  seq = 0;
  create(partial: any): T {
    return { ...partial } as T;
  }
  async save(row: any): Promise<T> {
    const idx = row.id ? this.rows.findIndex((r) => (r as any).id === row.id) : -1;
    if (idx >= 0) {
      this.rows[idx] = { ...this.rows[idx], ...row };
      return this.rows[idx];
    }
    const entity = { ...row };
    if (!entity.id) entity.id = 'row-' + ++this.seq;
    if (!entity.createdAt) entity.createdAt = new Date();
    this.rows.push(entity);
    return entity as T;
  }
  async find(opts: any = {}): Promise<T[]> {
    let out = this.rows.filter((r) => {
      if (!opts.where) return true;
      return Object.entries(opts.where).every(([k, v]) => (r as any)[k] === v);
    });
    if (opts.order) {
      const [field, dir] = Object.entries(opts.order)[0];
      out = out.slice().sort((a, b) => {
        const av = (a as any)[field];
        const bv = (b as any)[field];
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return dir === 'DESC' ? -cmp : cmp;
      });
    }
    return out;
  }
  async findOne(opts: any = {}): Promise<T | null> {
    const found = await this.find(opts);
    return found.length === 0 ? null : found[0];
  }
  async remove(row: any): Promise<T> {
    const idx = this.rows.findIndex((r) => (r as any).id === row.id);
    if (idx >= 0) this.rows.splice(idx, 1);
    return row;
  }
}

const makeService = () => {
  const repos = Array.from({ length: 28 }, () => new RepoDouble<any>());
  const svc = new AiTrainingService(
    repos[0] as any, repos[1] as any, repos[2] as any, repos[3] as any,
    repos[4] as any, repos[5] as any, repos[6] as any, repos[7] as any,
    repos[8] as any, repos[9] as any, repos[10] as any, repos[11] as any,
    repos[12] as any, repos[13] as any, repos[14] as any, repos[15] as any,
    repos[16] as any, repos[17] as any, repos[18] as any, repos[19] as any,
    repos[20] as any, repos[21] as any, repos[22] as any, repos[23] as any,
    repos[24] as any, repos[25] as any, repos[26] as any, repos[27] as any,
  );
  return {
    svc,
    versions: repos[13] as RepoDouble<any>,
    cards: repos[14] as RepoDouble<any>,
    pins: repos[25] as RepoDouble<any>,
    reservations: repos[26] as RepoDouble<any>,
    packages: repos[27] as RepoDouble<any>,
  };
};

/** Register model versions 1..stages.length with weights w-1, w-2, ... */
const seedVersions = async (repo: RepoDouble<any>, userId: string, modelId: string, stages: string[]) => {
  for (let i = 0; i < stages.length; i++) {
    await repo.save({
      userId,
      modelId,
      version: i + 1,
      stage: stages[i],
      owners: [userId],
      lineage: { datasetId: 'd-1' },
      weightsFingerprint: 'w-' + (i + 1),
      fingerprint: 'modfp-' + modelId + '-' + (i + 1),
    });
  }
};

describe('AI-045..047 workspace model access (functional lifecycle)', () => {
  it('pinning freezes the latest version by default, records the switch-back trace, and re-pins are idempotent', async () => {
    const { svc, versions, pins } = makeService();
    await seedVersions(versions, 'user-a', 'm-1', ['experimental', 'experimental', 'beta']);
    const pinned = await svc.pinWorkspaceModel('user-a', {
      workspaceId: 'ws1', modelId: 'm-1', modelTier: 'paid', planTiers: ['free', 'paid'],
    });
    expect(pinned.pin.versionId).toBe(3);
    expect(pinned.pin.switchedFrom).toBeNull();
    expect(pinned.pin.fingerprint).toBe('pin_84867cb2');
    expect(pinned.duplicate).toBe(false);
    const again = await svc.pinWorkspaceModel('user-a', {
      workspaceId: 'ws1', modelId: 'm-1', modelTier: 'paid', planTiers: ['free', 'paid'],
    });
    expect(again.duplicate).toBe(true);
    const switched = await svc.pinWorkspaceModel('user-a', {
      workspaceId: 'ws1', modelId: 'm-1', versionId: 2, modelTier: 'paid', planTiers: ['free', 'paid'],
    });
    expect(switched.pin.versionId).toBe(2);
    expect(switched.pin.switchedFrom).toBe(3);
    expect(switched.pin.fingerprint).toBe('pin_84867cb1');
    expect(switched.duplicate).toBe(false);
    expect(pins.rows.length).toBe(1);
    const resolved = await svc.resolveWorkspaceModel('user-a', { workspaceId: 'ws1', modelId: 'm-1' });
    expect(resolved).toEqual({ workspaceId: 'ws1', modelId: 'm-1', versionId: 2, source: 'pinned' });
  });

  it('pin refusals are named and store nothing: tier law per model, unknown version, empty registry', async () => {
    const { svc, versions, pins } = makeService();
    await seedVersions(versions, 'user-a', 'm-1', ['experimental', 'experimental', 'beta']);
    await expect(svc.pinWorkspaceModel('user-a', {
      workspaceId: 'ws1', modelId: 'm-1', modelTier: 'restricted', planTiers: ['free', 'paid'],
    })).rejects.toThrow('pin-tier-denied:restricted');
    await expect(svc.pinWorkspaceModel('user-a', {
      workspaceId: 'ws1', modelId: 'm-1', versionId: 9, modelTier: 'paid', planTiers: ['free', 'paid'],
    })).rejects.toThrow('pin-unknown-version:9');
    await expect(svc.pinWorkspaceModel('user-a', {
      workspaceId: 'ws1', modelId: 'm-none', modelTier: 'paid', planTiers: ['free', 'paid'],
    })).rejects.toThrow('pin-no-versions:m-none');
    expect(pins.rows.length).toBe(0);
  });

  it('unpin removes the pin by name; resolve falls back to the latest version only after unpin', async () => {
    const { svc, versions, pins } = makeService();
    await seedVersions(versions, 'user-a', 'm-1', ['experimental', 'experimental', 'beta']);
    await svc.pinWorkspaceModel('user-a', {
      workspaceId: 'ws1', modelId: 'm-1', modelTier: 'paid', planTiers: ['free', 'paid'],
    });
    const unpinned = await svc.unpinWorkspaceModel('user-a', { workspaceId: 'ws1', modelId: 'm-1' });
    expect(unpinned).toEqual({ workspaceId: 'ws1', modelId: 'm-1', unpinnedVersionId: 3 });
    expect(pins.rows.length).toBe(0);
    await expect(svc.unpinWorkspaceModel('user-a', { workspaceId: 'ws1', modelId: 'm-1' }))
      .rejects.toThrow('unpin-not-pinned:ws1:m-1');
    const resolved = await svc.resolveWorkspaceModel('user-a', { workspaceId: 'ws1', modelId: 'm-1' });
    expect(resolved).toEqual({ workspaceId: 'ws1', modelId: 'm-1', versionId: 3, source: 'fallback' });
    await expect(svc.resolveWorkspaceModel('user-a', { workspaceId: 'ws1', modelId: 'm-none' }))
      .rejects.toThrow('resolve-no-pinned:ws1:m-none');
  });

  it('dedicated instances: exact free-capacity arithmetic, idempotent reserve, resize returns own slots first', async () => {
    const { svc, reservations } = makeService();
    const first = await svc.reserveDedicatedInstances('user-a', {
      workspaceId: 'ws1', modelId: 'm-1', slots: 4, poolTotal: 10,
    });
    expect(first.reservation.slots).toBe(4);
    expect(first.reservation.freeAfter).toBe(6);
    expect(first.reservation.fingerprint).toBe('inst_84867cb3');
    expect(first.duplicate).toBe(false);
    const again = await svc.reserveDedicatedInstances('user-a', {
      workspaceId: 'ws1', modelId: 'm-1', slots: 4, poolTotal: 10,
    });
    expect(again.duplicate).toBe(true);
    expect(reservations.rows.length).toBe(1);
    // Another workspace holds 3 of the remaining slots — capacity is shared.
    await svc.reserveDedicatedInstances('user-b', {
      workspaceId: 'ws2', modelId: 'm-1', slots: 3, poolTotal: 10,
    });
    // Resize returns the own 4 slots to the pool first: free = 10 - 3 - 4.
    const resized = await svc.reserveDedicatedInstances('user-a', {
      workspaceId: 'ws1', modelId: 'm-1', slots: 2, poolTotal: 10,
    });
    expect(resized.reservation.freeAfter).toBe(1);
    expect(resized.reservation.fingerprint).toBe('inst_84867cb1');
    // Over-commit is refused with the exact free capacity in the refusal.
    await expect(svc.reserveDedicatedInstances('user-a', {
      workspaceId: 'ws1', modelId: 'm-1', slots: 8, poolTotal: 10,
    })).rejects.toThrow('reserve-over-commit:8>5');
    expect(reservations.rows.length).toBe(2);
    const released = await svc.releaseDedicatedInstances('user-a', { workspaceId: 'ws1', modelId: 'm-1' });
    expect(released).toEqual({ workspaceId: 'ws1', modelId: 'm-1', slotsReturned: 2, fingerprint: 'inst_84867cb1' });
    await expect(svc.releaseDedicatedInstances('user-a', { workspaceId: 'ws1', modelId: 'm-1' }))
      .rejects.toThrow('release-not-reserved:ws1:m-1');
    expect(reservations.rows.length).toBe(1);
    expect((reservations.rows[0] as any).userId).toBe('user-b');
  });

  it('on-prem packages: only exportable stages leave, card and license mandatory, fingerprint-idempotent', async () => {
    const { svc, versions, cards, packages } = makeService();
    await seedVersions(versions, 'user-a', 'm-1', ['experimental', 'beta', 'beta']);
    await cards.save({ userId: 'user-a', modelId: 'm-1', version: 2, card: { cardFingerprint: 'cf-2' } });
    const built = await svc.buildOnPremPackageForModel('user-a', {
      modelId: 'm-1', versionId: 2, licenseTerms: 'enterprise-1.0',
    });
    expect(built.reused).toBe(false);
    expect(built.pkg).toEqual({
      modelId: 'm-1',
      versionId: 2,
      format: 'forge-pkg-1',
      weightsFingerprint: 'w-2',
      quantized: false,
      licenseTerms: 'enterprise-1.0',
      fingerprint: 'xpk_d4123481',
    });
    const again = await svc.buildOnPremPackageForModel('user-a', {
      modelId: 'm-1', versionId: 2, licenseTerms: 'enterprise-1.0',
    });
    expect(again.reused).toBe(true);
    expect(packages.rows.length).toBe(1);
    const quantized = await svc.buildOnPremPackageForModel('user-a', {
      modelId: 'm-1', versionId: 2, licenseTerms: 'enterprise-1.0', quantized: true,
    });
    expect(quantized.reused).toBe(false);
    expect(quantized.pkg.fingerprint).toBe('xpk_8a561756');
    expect(packages.rows.length).toBe(2);
    await expect(svc.buildOnPremPackageForModel('user-a', {
      modelId: 'm-1', versionId: 1, licenseTerms: 'enterprise-1.0',
    })).rejects.toThrow('package-not-servable:experimental');
    await expect(svc.buildOnPremPackageForModel('user-a', {
      modelId: 'm-1', versionId: 3, licenseTerms: 'enterprise-1.0',
    })).rejects.toThrow('package-no-card:m-1');
    await expect(svc.buildOnPremPackageForModel('user-a', {
      modelId: 'm-1', versionId: 2, licenseTerms: '',
    })).rejects.toThrow('package-no-license');
    expect(packages.rows.length).toBe(2);
  });

  it('reimport passes the same gates: weights, quality, license — each refusal named, nothing stored', async () => {
    const { svc, versions, cards, packages } = makeService();
    await seedVersions(versions, 'user-a', 'm-1', ['experimental', 'beta', 'beta']);
    await cards.save({ userId: 'user-a', modelId: 'm-1', version: 2, card: { cardFingerprint: 'cf-2' } });
    await svc.buildOnPremPackageForModel('user-a', { modelId: 'm-1', versionId: 2, licenseTerms: 'enterprise-1.0' });
    const verified = await svc.verifyOnPremReimport('user-a', {
      modelId: 'm-1', versionId: 2, quantized: false,
      weightsFingerprint: 'w-2', qualityScore: 0.92, qualityGate: 0.9, licenseAccepted: true,
    });
    expect(verified).toEqual({ accepted: true, fingerprint: 'xpk_d4123481', modelId: 'm-1', versionId: 2 });
    await expect(svc.verifyOnPremReimport('user-a', {
      modelId: 'm-1', versionId: 2, quantized: false,
      weightsFingerprint: 'w-2', qualityScore: 0.89, qualityGate: 0.9, licenseAccepted: true,
    })).rejects.toThrow('reimport-quality-gate:0.89<0.9');
    await expect(svc.verifyOnPremReimport('user-a', {
      modelId: 'm-1', versionId: 2, quantized: false,
      weightsFingerprint: 'w-9', qualityScore: 0.95, qualityGate: 0.9, licenseAccepted: true,
    })).rejects.toThrow('reimport-weights-mismatch:w-9!=w-2');
    await expect(svc.verifyOnPremReimport('user-a', {
      modelId: 'm-1', versionId: 2, quantized: false,
      weightsFingerprint: 'w-2', qualityScore: 0.95, qualityGate: 0.9, licenseAccepted: false,
    })).rejects.toThrow('reimport-license-not-accepted');
    expect(packages.rows.length).toBe(1);
  });
});

describe('AI-045..047 zero trust (adversarial)', () => {
  it('another user registry, pins, reservations and packages are invisible', async () => {
    const { svc, versions, cards } = makeService();
    await seedVersions(versions, 'user-a', 'm-1', ['experimental', 'beta', 'beta']);
    await cards.save({ userId: 'user-a', modelId: 'm-1', version: 2, card: { cardFingerprint: 'cf-2' } });
    await svc.pinWorkspaceModel('user-a', {
      workspaceId: 'ws1', modelId: 'm-1', modelTier: 'paid', planTiers: ['free', 'paid'],
    });
    await svc.buildOnPremPackageForModel('user-a', { modelId: 'm-1', versionId: 2, licenseTerms: 'enterprise-1.0' });
    expect((await svc.listWorkspacePins('user-b')).length).toBe(0);
    await expect(svc.resolveWorkspaceModel('user-b', { workspaceId: 'ws1', modelId: 'm-1' }))
      .rejects.toThrow('resolve-no-pinned:ws1:m-1');
    await expect(svc.pinWorkspaceModel('user-b', {
      workspaceId: 'ws1', modelId: 'm-1', modelTier: 'paid', planTiers: ['free', 'paid'],
    })).rejects.toThrow('pin-no-versions:m-1');
    await expect(svc.buildOnPremPackageForModel('user-b', { modelId: 'm-1', versionId: 2, licenseTerms: 'x' }))
      .rejects.toThrow('registry-model-version-not-found:m-1:2');
    await expect(svc.verifyOnPremReimport('user-b', {
      modelId: 'm-1', versionId: 2, quantized: false,
      weightsFingerprint: 'w-2', qualityScore: 0.95, qualityGate: 0.9, licenseAccepted: true,
    })).rejects.toThrow('reimport-no-package');
    expect((await svc.listOnPremPackages('user-b')).length).toBe(0);
  });

  it('shared-pool accounting never leaks rows: each user sees only their own reservation', async () => {
    const { svc } = makeService();
    await svc.reserveDedicatedInstances('user-a', { workspaceId: 'ws1', modelId: 'm-1', slots: 4, poolTotal: 10 });
    await svc.reserveDedicatedInstances('user-b', { workspaceId: 'ws2', modelId: 'm-1', slots: 3, poolTotal: 10 });
    const mine = await svc.listInstanceReservations('user-a', 'm-1');
    const theirs = await svc.listInstanceReservations('user-b', 'm-1');
    expect(mine.length).toBe(1);
    expect(theirs.length).toBe(1);
    expect((mine[0] as any).userId).toBe('user-a');
    expect((theirs[0] as any).userId).toBe('user-b');
    // user-b over-commits against user-a real holding — refused with exact math.
    await expect(svc.reserveDedicatedInstances('user-b', {
      workspaceId: 'ws2', modelId: 'm-1', slots: 9, poolTotal: 10,
    })).rejects.toThrow('reserve-over-commit:9>3');
  });
});
