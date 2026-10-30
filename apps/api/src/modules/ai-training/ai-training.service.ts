// ============================================================================
// FILE: /apps/api/src/modules/ai-training/ai-training.service.ts
// ============================================================================
// The training data intake pipeline (FORGE AI-001..006). Three honest
// behaviors:
//   1. Admit: a user uploads an asset (image, stroke recording, sketch,
//      finished work, correction pair, rating). It enters ONLY through the
//      gates: classification check (blocked classes never enter), consent
//      (hard gate), scrub (PII/secrets destroyed destructively, evidence
//      stored). Refusals are named — the user always learns why.
//   2. Curate: quality scores are human-labeled and stored as given.
//   3. Snapshot: eligible assets become immutable dataset versions with
//      content fingerprints and lineage chains. Identical content is
//      refused by name (the engine's immutability law).
// Zero-trust scoping on every query — one user's training data is never
// visible to another.

import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { TrainingAsset, TrainingAssetKind } from './entities/training-asset.entity';
import { TrainingDataset } from './entities/training-dataset.entity';
import {
  buildSnapshot,
  DatasetItem,
  DatasetRecord,
} from './engine/dataset-snapshot';
import {
  checkClassificationEligibility,
  scrubText,
} from './engine/scrub-engine';
import {
  buildPlan,
  canTransition,
  computeResume,
  validateMetricSeries,
  compareExperiments,
  RunState,
} from './engine/training-run-engine';
import { recordCost, reproducibilityFingerprint } from './engine/cost-reproducibility-engine';
import {
  defineProbeBattery,
  gradeSafetyRun as gradeSafetyRunEngine,
  groundClaims,
  detectContamination,
  tallyBlindComparison,
} from './engine/safety-eval-engine';
import {
  defineEvalSuite,
  suiteFingerprint,
  gradeSuite,
  aggregatePanel,
  applyRegressionGate,
  EvalCase,
} from './engine/eval-gate-engine';
import { EvalSuiteVersion } from './entities/eval-suite-version.entity';
import { PanelVoteRecord } from './entities/panel-vote.entity';
import { SafetyProbeBattery } from './entities/safety-battery.entity';
import { SafetyRunGrade } from './entities/safety-run-grade.entity';
import { BlindBallot } from './entities/blind-ballot.entity';
import { TrainingRun } from './entities/training-run.entity';
import {
  CreateTrainingAssetDto, BuildDatasetDto,
  CreateTrainingRunDto, TransitionRunDto, RecordRunCheckpointDto,
  RecordRunCostDto, RecordRunMetricDto, CompareRunsDto,
  DefineEvalSuiteDto, GradeEvalSuiteDto, RecordPanelVoteDto, ShipGateDto,
  DefineSafetyBatteryDto, GradeSafetyRunDto, GroundClaimsDto,
  CheckContaminationDto, CastBlindVoteDto, TallyBlindVotesDto,
} from './dto/ai-training.dto';

@Injectable()
export class AiTrainingService {
  constructor(
    @InjectRepository(TrainingAsset)
    private readonly assetRepository: Repository<TrainingAsset>,
    @InjectRepository(TrainingDataset)
    private readonly datasetRepository: Repository<TrainingDataset>,
    @InjectRepository(TrainingRun)
    private readonly runRepository: Repository<TrainingRun>,
    @InjectRepository(EvalSuiteVersion)
    private readonly evalSuiteRepository: Repository<EvalSuiteVersion>,
    @InjectRepository(PanelVoteRecord)
    private readonly panelVoteRepository: Repository<PanelVoteRecord>,
    @InjectRepository(SafetyProbeBattery)
    private readonly safetyBatteryRepository: Repository<SafetyProbeBattery>,
    @InjectRepository(SafetyRunGrade)
    private readonly safetyGradeRepository: Repository<SafetyRunGrade>,
    @InjectRepository(BlindBallot)
    private readonly blindBallotRepository: Repository<BlindBallot>,
  ) {}

  // --- 1. Admit an asset through the gates (AI-002/003/004) ---
  async createAsset(userId: string, dto: CreateTrainingAssetDto): Promise<TrainingAsset> {
    if (dto.consent !== true) {
      throw new BadRequestException(
        'Consent is a hard gate: an asset without consent never enters training data (reason: dataset-item-without-consent).',
      );
    }
    const classification = checkClassificationEligibility({
      classification: dto.classification,
    });
    if (!classification.ok) {
      throw new BadRequestException(
        'This asset cannot enter training data (reason: ' + classification.reason + ').',
      );
    }
    let description: string | null = null;
    let scrubFindings: Record<string, any>[] | null = null;
    let scrubRedactions = 0;
    if (dto.description && dto.description.trim().length > 0) {
      const scrub = scrubText({ text: dto.description });
      if (!scrub.ok) {
        throw new BadRequestException(
          'The description was refused by the scrubber (reason: ' + scrub.reason + ').',
        );
      }
      description = scrub.value.scrubbed;
      scrubFindings = scrub.value.findings;
      scrubRedactions = scrub.value.totalRedactions;
    }
    const asset = this.assetRepository.create({
      userId,
      kind: dto.kind,
      classification: dto.classification,
      consent: dto.consent,
      quality: dto.quality ?? 0,
      title: dto.title.trim(),
      description,
      storageKey: dto.storageKey?.trim() || null,
      scrubFindings,
      scrubRedactions,
      tags: (dto.tags || []).map((t) => t.trim().toLowerCase()).filter(Boolean),
      eligible: true,
    });
    return this.assetRepository.save(asset);
  }

  async listAssets(
    userId: string,
    options: { kind?: string; eligible?: boolean; search?: string; page?: number; limit?: number } = {},
  ): Promise<{ data: TrainingAsset[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(options.limit) || 20));
    const where: any = { userId };
    if (options.kind && Object.values(TrainingAssetKind).includes(options.kind as TrainingAssetKind)) {
      where.kind = options.kind;
    }
    if (typeof options.eligible === 'boolean') where.eligible = options.eligible;
    if (options.search) where.title = options.search;
    const [data, total] = await this.assetRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total, page, limit };
  }

  async getAsset(userId: string, id: string): Promise<TrainingAsset> {
    const asset = await this.assetRepository.findOne({ where: { id, userId } });
    if (!asset) throw new NotFoundException('Training asset with id ' + id + ' not found');
    return asset;
  }

  // AI-140: deletion carries into future datasets — assets are soft-deleted,
  // so any future snapshot (which reads only live assets) excludes them
  // automatically. The dataset snapshots that already consumed the asset
  // remain frozen evidence of what was trained on, and when.
  async removeAsset(userId: string, id: string): Promise<void> {
    const asset = await this.getAsset(userId, id);
    await this.assetRepository.softDelete(asset.id);
  }

  // --- 2. Snapshot eligible assets into an immutable dataset version (AI-005/006) ---
  async buildDataset(userId: string, dto: BuildDatasetDto): Promise<TrainingDataset> {
    const tags = (dto.tags || []).map((t) => t.trim().toLowerCase()).filter(Boolean);
    const assets = await this.assetRepository.find({
      where: { userId, eligible: true },
      order: { createdAt: 'ASC' },
    });
    const filtered = tags.length > 0
      ? assets.filter((a) => (a.tags || []).some((t) => tags.includes(t)))
      : assets;
    if (filtered.length === 0) {
      throw new BadRequestException(
        'No eligible training assets match this dataset request (reason: dataset-no-items).',
      );
    }

    // Parent resolution: explicit parent, else the latest snapshot of the name.
    let parentRow: TrainingDataset | null = null;
    if (dto.parentSnapshotId) {
      parentRow = await this.datasetRepository.findOne({
        where: { id: dto.parentSnapshotId, userId },
      });
      if (!parentRow) {
        throw new NotFoundException(
          'Parent dataset snapshot ' + dto.parentSnapshotId + ' not found',
        );
      }
    } else {
      const existing = await this.datasetRepository.find({
        where: { userId, name: dto.name },
        order: { version: 'DESC' },
        take: 1,
      });
      parentRow = existing[0] ?? null;
    }

    const parentRecord: DatasetRecord | null = parentRow
      ? {
          id: parentRow.id,
          items: [],
          version: parentRow.version,
          createdAt: parentRow.createdAt.toISOString(),
          lineage: {
            parentId: parentRow.parentSnapshotId,
            parentVersion: parentRow.parentVersion,
          },
          fingerprint: parentRow.fingerprint,
        }
      : null;

    // Engine consumes per-item content truth — id, kind, classification,
    // consent, quality, tags — so the fingerprint pins the exact membership.
    const items: DatasetItem[] = filtered.map((a) => ({
      id: a.id,
      kind: a.kind as DatasetItem['kind'],
      classification: a.classification as DatasetItem['classification'],
      consent: a.consent,
      quality: a.quality,
      tags: a.tags || [],
    }));

    // Reconstruct the parent's fingerprint from its frozen membership so
    // unchanged-content refusals compare content to content, never guesswork.
    if (parentRow) {
      const parentAssets = await this.assetRepository.find({
        where: { id: In(parentRow.itemIds), userId },
        withDeleted: true,
        order: { createdAt: 'ASC' },
      });
      const byId = new Map(parentAssets.map((a) => [a.id, a]));
      const parentItems: DatasetItem[] = (parentRow.itemIds ?? [])
        .map((iid: string) => byId.get(iid))
        .filter((a): a is TrainingAsset => Boolean(a))
        .map((a) => ({
          id: a.id,
          kind: a.kind as DatasetItem['kind'],
          classification: a.classification as DatasetItem['classification'],
          consent: a.consent,
          quality: a.quality,
          tags: a.tags || [],
        }));
      if (parentItems.length === (parentRow.itemIds ?? []).length) {
        parentRecord!.items = parentItems;
      }
    }

    const snap = buildSnapshot({
      id: dto.name,
      items,
      parent: parentRecord,
      now: new Date().toISOString(),
    });
    if (!snap.ok) {
      if (snap.reason === 'dataset-unchanged-content') {
        throw new ConflictException(
          'This dataset content is unchanged from version ' +
            (parentRow ? String(parentRow.version) : 'the parent') +
            ' — an identical snapshot is refused (reason: ' + snap.reason + ').',
        );
      }
      throw new BadRequestException(
        'The dataset was refused (reason: ' + snap.reason + ').',
      );
    }

    const kinds: Record<string, number> = {};
    let qualitySum = 0;
    for (const it of items) {
      kinds[it.kind] = (kinds[it.kind] ?? 0) + 1;
      qualitySum += it.quality;
    }
    const summary = {
      kinds,
      averageQuality: Math.round((qualitySum / items.length) * 10) / 10,
      publicCount: items.filter((i) => i.classification === 'public').length,
      privateCount: items.filter((i) => i.classification === 'private').length,
      filterTags: tags,
    };

    const row = this.datasetRepository.create({
      userId,
      name: dto.name.trim(),
      version: snap.value.version,
      fingerprint: snap.value.fingerprint,
      itemIds: items.map((i) => i.id),
      itemCount: items.length,
      parentSnapshotId: parentRow ? parentRow.id : null,
      parentVersion: parentRow ? parentRow.version : null,
      summary,
    });
    return this.datasetRepository.save(row);
  }

  async listDatasets(
    userId: string,
    options: { name?: string; page?: number; limit?: number } = {},
  ): Promise<{ data: TrainingDataset[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(options.limit) || 20));
    const where: any = { userId };
    if (options.name) where.name = options.name.trim();
    const [data, total] = await this.datasetRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total, page, limit };
  }

  async getDataset(userId: string, id: string): Promise<TrainingDataset> {
    const row = await this.datasetRepository.findOne({ where: { id, userId } });
    if (!row) throw new NotFoundException('Training dataset with id ' + id + ' not found');
    return row;
  }

  // --- 3. Training runs (AI-013/014/017/018/019/020) ---
  // A run is created against a frozen dataset snapshot; the plan, budget and
  // reproducibility pins are engine truths, never service guesses.

  async getRun(userId: string, id: string): Promise<TrainingRun> {
    const run = await this.runRepository.findOne({ where: { id, userId } });
    if (!run) throw new NotFoundException('Training run with id ' + id + ' not found');
    return run;
  }

  async createRun(userId: string, dto: CreateTrainingRunDto): Promise<TrainingRun> {
    const dataset = await this.getDataset(userId, dto.datasetId);
    const plan = buildPlan({
      datasetFingerprint: dataset.fingerprint,
      itemCount: dataset.itemCount,
      epochs: dto.epochs,
      batchSize: dto.batchSize,
      budget: dto.budget,
      costPerStep: dto.costPerStep,
    });
    if (!plan.ok) {
      throw new BadRequestException(
        'The training run was refused (reason: ' + plan.reason + ').',
      );
    }
    const fp = reproducibilityFingerprint({
      datasetFingerprint: dataset.fingerprint,
      codeVersion: dto.codeVersion,
      seed: dto.seed,
      environment: dto.environment,
      hyperparams: dto.hyperparams,
    });
    if (!fp.ok) {
      throw new BadRequestException(
        'The training run was refused (reason: ' + fp.reason + ').',
      );
    }
    const row = this.runRepository.create({
      userId,
      datasetId: dataset.id,
      datasetVersion: dataset.version,
      datasetFingerprint: dataset.fingerprint,
      state: 'planned',
      plan: {
        epochs: plan.value.epochs,
        batchSize: plan.value.batchSize,
        steps: plan.value.steps,
        estimatedCost: plan.value.estimatedCost,
      },
      budget: dto.budget,
      spent: 0,
      costEntries: [],
      checkpoint: null,
      metrics: [],
      runFingerprint: fp.value,
      codeVersion: dto.codeVersion,
      seed: dto.seed,
      environment: dto.environment,
      hyperparams: dto.hyperparams ?? null,
    });
    return this.runRepository.save(row);
  }

  async listRuns(
    userId: string,
    options: { state?: string; datasetId?: string; page?: number; limit?: number } = {},
  ): Promise<{ data: TrainingRun[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(options.limit) || 20));
    const where: any = { userId };
    if (options.state) where.state = options.state;
    if (options.datasetId) where.datasetId = options.datasetId;
    const [data, total] = await this.runRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total, page, limit };
  }

  async transitionRun(userId: string, id: string, dto: TransitionRunDto): Promise<TrainingRun> {
    const run = await this.getRun(userId, id);
    const t = canTransition({ from: run.state as RunState, to: dto.to as RunState });
    if (!t.ok) {
      throw new BadRequestException(
        'The run transition was refused (reason: ' + t.reason + ').',
      );
    }
    if (dto.to === 'running' && run.state === 'paused') {
      const r = computeResume({
        state: 'paused',
        checkpoint: run.checkpoint,
        planSteps: run.plan.steps,
      });
      if (!r.ok) {
        throw new BadRequestException(
          'The run cannot resume (reason: ' + r.reason + ').',
        );
      }
    }
    run.state = dto.to;
    return this.runRepository.save(run);
  }

  async recordRunCheckpoint(userId: string, id: string, dto: RecordRunCheckpointDto): Promise<TrainingRun> {
    const run = await this.getRun(userId, id);
    if (run.state !== 'running') {
      throw new BadRequestException(
        'A checkpoint is only recorded while the run is running (reason: run-not-running:' + run.state + ').',
      );
    }
    if (dto.step >= run.plan.steps) {
      throw new BadRequestException(
        'The checkpoint is outside the plan (reason: resume-checkpoint-past-plan:' + dto.step + '>=' + run.plan.steps + ').',
      );
    }
    run.checkpoint = {
      step: dto.step,
      sequence: (run.checkpoint?.sequence ?? 0) + 1,
      loss: dto.loss,
      savedAt: new Date().toISOString(),
    };
    return this.runRepository.save(run);
  }

  async recordRunCost(userId: string, id: string, dto: RecordRunCostDto): Promise<TrainingRun> {
    const run = await this.getRun(userId, id);
    const r = recordCost(
      { budget: Number(run.budget), spent: Number(run.spent), entries: run.costEntries ?? [] },
      { step: dto.step, units: dto.units, at: new Date().toISOString() },
    );
    if (!r.ok) {
      throw new ConflictException(
        'The cost event was refused (reason: ' + r.reason + ').',
      );
    }
    run.spent = r.value.spent;
    run.costEntries = r.value.entries;
    return this.runRepository.save(run);
  }

  async recordRunMetric(userId: string, id: string, dto: RecordRunMetricDto): Promise<TrainingRun> {
    const run = await this.getRun(userId, id);
    const series = (run.metrics ?? []).concat([
      dto.evalScore !== undefined
        ? { step: dto.step, loss: dto.loss, evalScore: dto.evalScore }
        : { step: dto.step, loss: dto.loss },
    ]);
    const v = validateMetricSeries(series);
    if (!v.ok) {
      throw new BadRequestException(
        'The metric point was refused (reason: ' + v.reason + ').',
      );
    }
    run.metrics = v.value;
    return this.runRepository.save(run);
  }

  async compareRuns(userId: string, dto: CompareRunsDto) {
    const a = await this.getRun(userId, dto.runAId);
    const b = await this.getRun(userId, dto.runBId);
    const finalLoss = (r: TrainingRun): number =>
      r.metrics && r.metrics.length > 0 ? r.metrics[r.metrics.length - 1].loss : Number.NaN;
    const bestEval = (r: TrainingRun): number | undefined => {
      const es = (r.metrics ?? [])
        .map((m) => m.evalScore)
        .filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
      return es.length > 0 ? Math.max(...es) : undefined;
    };
    const cmp = compareExperiments({
      a: { runId: a.id, finalLoss: finalLoss(a), bestEvalScore: bestEval(a), steps: a.plan.steps },
      b: { runId: b.id, finalLoss: finalLoss(b), bestEvalScore: bestEval(b), steps: b.plan.steps },
    });
    if (!cmp.ok) {
      throw new BadRequestException(
        'The comparison was refused (reason: ' + cmp.reason + ').',
      );
    }
    return cmp.value;
  }

  // --- 5. Eval harness (AI-021..024) --------------------------------------
  // Suites are versioned and content-fingerprinted; re-versioning identical
  // content is refused by name. Panel votes are one-per-panelist-per-case.
  // Ship gates name every failure — a model cannot ship below thresholds.

  async defineEvalSuite(userId: string, dto: DefineEvalSuiteDto): Promise<EvalSuiteVersion> {
    const def = defineEvalSuite({
      id: dto.suiteId,
      version: dto.version,
      kind: dto.kind as 'forge' | 'creative',
      cases: dto.cases as unknown as EvalCase[],
    });
    if (!def.ok) {
      throw new BadRequestException(def.reason);
    }
    const fp = suiteFingerprint(def.value);
    if (!fp.ok) {
      throw new BadRequestException(fp.reason);
    }
    const existing = await this.evalSuiteRepository.find({
      where: { userId, suiteId: dto.suiteId },
      order: { version: 'DESC' },
    });
    if (existing.length > 0) {
      const latest = existing[0];
      if (dto.version !== latest.version + 1) {
        throw new ConflictException('eval-suite-version-gap:' + dto.version + '!=' + (latest.version + 1));
      }
      // Content-immutability law: a new version may never repeat content
      // already recorded under ANY prior version. The fingerprint is
      // version-insensitive by law, so the whole history is checked —
      // re-offering v1 content as v3 is refused, not silently admitted.
      const duplicate = existing.find((row) => row.fingerprint === fp.value);
      if (duplicate) {
        throw new ConflictException('eval-suite-unchanged-content:' + fp.value);
      }
    } else if (dto.version !== 1) {
      throw new ConflictException('eval-suite-version-gap:' + dto.version + '!=1');
    }
    const row = this.evalSuiteRepository.create({
      userId,
      suiteId: dto.suiteId,
      version: dto.version,
      kind: dto.kind,
      cases: dto.cases,
      fingerprint: fp.value,
    });
    return this.evalSuiteRepository.save(row);
  }

  async getEvalSuite(userId: string, suiteId: string, version?: number): Promise<EvalSuiteVersion> {
    const row = await this.evalSuiteRepository.findOne({
      where: version !== undefined ? { userId, suiteId, version } : { userId, suiteId },
      order: { version: 'DESC' },
    });
    if (!row) {
      throw new NotFoundException('eval-suite-not-found:' + suiteId);
    }
    return row;
  }

  async gradeEvalSuite(userId: string, suiteId: string, dto: GradeEvalSuiteDto) {
    const row = await this.getEvalSuite(userId, suiteId, dto.version);
    const graded = gradeSuite(
      {
        id: row.suiteId,
        version: row.version,
        kind: row.kind as 'forge' | 'creative',
        cases: row.cases as unknown as EvalCase[],
      },
      dto.results,
    );
    if (!graded.ok) {
      throw new BadRequestException(graded.reason);
    }
    return {
      suiteId: row.suiteId,
      version: row.version,
      score: graded.value.score,
      perCase: graded.value.perCase,
    };
  }

  async recordPanelVote(userId: string, dto: RecordPanelVoteDto): Promise<PanelVoteRecord> {
    const suite = await this.getEvalSuite(userId, dto.suiteId);
    if (!suite.cases.some((c) => c.id === dto.caseId)) {
      throw new BadRequestException('panel-case-unknown:' + dto.caseId);
    }
    const dup = await this.panelVoteRepository.findOne({
      where: { userId, suiteId: dto.suiteId, caseId: dto.caseId, panelist: dto.panelist },
    });
    if (dup) {
      throw new ConflictException('panel-duplicate-panelist:' + dto.panelist);
    }
    const vote = this.panelVoteRepository.create({
      userId,
      suiteId: dto.suiteId,
      caseId: dto.caseId,
      panelist: dto.panelist,
      score: dto.score,
    });
    return this.panelVoteRepository.save(vote);
  }

  async aggregatePanelVotes(userId: string, suiteId: string, caseId: string, quorum = 3) {
    await this.getEvalSuite(userId, suiteId);
    const rows = await this.panelVoteRepository.find({
      where: { userId, suiteId, caseId },
      order: { createdAt: 'ASC' },
    });
    const agg = aggregatePanel(
      rows.map((r) => ({ panelist: r.panelist, score: Number(r.score) })),
      quorum,
    );
    if (!agg.ok) {
      throw new BadRequestException(agg.reason);
    }
    return { suiteId, caseId, median: agg.value.median, count: agg.value.count, quorum };
  }

  async applyShipGate(dto: ShipGateDto) {
    const gate = applyRegressionGate(dto.metrics, { thresholds: dto.thresholds });
    if (!gate.ok) {
      throw new BadRequestException(gate.reason);
    }
    return { passed: gate.value.passed };
  }

  // --- 6. Safety evals, grounding, contamination, blind comparison (AI-025..028) ---
  // Batteries are immutable once defined; safety grades are appendable audit
  // evidence; a voter votes once per contest; grounding and contamination are
  // pure engine laws — the service never guesses what the engine refused.

  async defineSafetyBattery(userId: string, dto: DefineSafetyBatteryDto): Promise<SafetyProbeBattery> {
    const def = defineProbeBattery({ id: dto.batteryId, probes: dto.probes });
    if (!def.ok) {
      throw new BadRequestException(def.reason);
    }
    const dup = await this.safetyBatteryRepository.findOne({
      where: { userId, batteryId: dto.batteryId },
    });
    if (dup) {
      throw new ConflictException('safety-battery-duplicate:' + dto.batteryId);
    }
    const row = this.safetyBatteryRepository.create({
      userId,
      batteryId: dto.batteryId,
      probes: dto.probes,
    });
    return this.safetyBatteryRepository.save(row);
  }

  async getSafetyBattery(userId: string, batteryId: string): Promise<SafetyProbeBattery> {
    const row = await this.safetyBatteryRepository.findOne({
      where: { userId, batteryId },
    });
    if (!row) {
      throw new NotFoundException('safety-battery-not-found:' + batteryId);
    }
    return row;
  }

  async gradeSafetyRun(userId: string, batteryId: string, dto: GradeSafetyRunDto) {
    const battery = await this.getSafetyBattery(userId, batteryId);
    const graded = gradeSafetyRunEngine(
      { id: battery.batteryId, probes: battery.probes },
      dto.responses,
    );
    if (!graded.ok) {
      throw new BadRequestException(graded.reason);
    }
    const row = this.safetyGradeRepository.create({
      userId,
      batteryId,
      grade: {
        batteryId: graded.value.batteryId,
        total: graded.value.total,
        passed: graded.value.passed,
        violations: graded.value.violations,
        passRate: graded.value.passRate,
      },
    });
    const saved = await this.safetyGradeRepository.save(row);
    return { gradeId: saved.id, ...graded.value };
  }

  async groundModelClaims(_userId: string, dto: GroundClaimsDto) {
    const report = groundClaims({
      claims: dto.claims,
      facts: dto.facts ?? [],
      maxUngrounded: dto.maxUngrounded,
    });
    if (!report.ok) {
      throw new BadRequestException(report.reason);
    }
    return report.value;
  }

  async checkContamination(_userId: string, dto: CheckContaminationDto) {
    const report = detectContamination({
      text: dto.text,
      corpus: dto.corpus,
      n: dto.n,
      threshold: dto.threshold,
    });
    if (!report.ok) {
      throw new BadRequestException(report.reason);
    }
    return report.value;
  }

  async castBlindVote(userId: string, dto: CastBlindVoteDto): Promise<BlindBallot> {
    const dup = await this.blindBallotRepository.findOne({
      where: { userId, contestId: dto.contestId, voterId: dto.voterId },
    });
    if (dup) {
      throw new ConflictException('blind-duplicate-voter:' + dto.voterId);
    }
    const row = this.blindBallotRepository.create({
      userId,
      contestId: dto.contestId,
      voterId: dto.voterId,
      preference: dto.preference,
    });
    return this.blindBallotRepository.save(row);
  }

  async tallyBlindVotes(userId: string, dto: TallyBlindVotesDto) {
    const rows = await this.blindBallotRepository.find({
      where: { userId, contestId: dto.contestId },
      order: { createdAt: 'ASC' },
    });
    const tally = tallyBlindComparison({
      votes: rows.map((r) => ({ voterId: r.voterId, preference: r.preference })),
      votesRequired: dto.votesRequired,
    });
    if (!tally.ok) {
      throw new BadRequestException(tally.reason);
    }
    return { contestId: dto.contestId, ...tally.value };
  }
}
