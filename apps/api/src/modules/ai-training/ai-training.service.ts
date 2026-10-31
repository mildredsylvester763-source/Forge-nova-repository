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
import {
  defineExperiment as defineExperimentEngine,
  assignVariant,
  tallyExperiment as tallyExperimentEngine,
  buildScorecards,
  buildTrend,
  mineFailures,
} from './engine/product-experiment-engine';
import {
  registerModelVersion,
  buildModelCard,
  promoteModel,
} from './engine/model-registry-engine';
import {
  planServingScale as planServingScaleEngine,
  buildQuantizationPlan as buildQuantizationPlanEngine,
  buildOnDeviceBundle as buildOnDeviceBundleEngine,
  routeModel as routeModelEngine,
} from './engine/model-serving-engine';
import {
  lookupResponseCache as lookupResponseCacheEngine,
  admitCacheEntry as admitCacheEntryEngine,
  applyStreamEvent as applyStreamEventEngine,
  planStreamResume as planStreamResumeEngine,
  aggregateServingMetrics as aggregateServingMetricsEngine,
  evaluateShadow as evaluateShadowEngine,
  planRollback as planRollbackEngine,
  StreamEvent,
} from './engine/model-operations-engine';
import {
  pinModel as pinModelEngine,
  unpinModel as unpinModelEngine,
  resolvePinnedModel as resolvePinnedModelEngine,
  reserveInstances as reserveInstancesEngine,
  releaseInstances as releaseInstancesEngine,
  buildOnPremPackage as buildOnPremPackageEngine,
  verifyReimport as verifyReimportEngine,
} from './engine/model-access-engine';
import {
  planGatewayRoute as planGatewayRouteEngine,
  recordProviderHealth as recordProviderHealthEngine,
  planFailoverChain as planFailoverChainEngine,
  byokFingerprint,
  validateByokKey as validateByokKeyEngine,
  enforceDataPolicy as enforceDataPolicyEngine,
  aggregateProviderUsage as aggregateProviderUsageEngine,
  ProviderDescriptor,
  ProviderHealthState,
  ByokKeyMeta,
  UsageSample,
} from './engine/model-gateway-engine';

import {
  admitGatewayLog as admitGatewayLogEngine,
  planLogRetention as planLogRetentionEngine,
  planZeroRetentionRoute as planZeroRetentionRouteEngine,
  registerCapabilityMatrix as registerCapabilityMatrixEngine,
  matchModelCapabilities as matchModelCapabilitiesEngine,
  normalizeToolCall as normalizeToolCallEngine,
  registerOutputSchema as registerOutputSchemaEngine,
  validateStructuredOutput as validateStructuredOutputEngine,
} from './engine/model-gateway-ops-engine';
import { EvalSuiteVersion } from './entities/eval-suite-version.entity';
import { PanelVoteRecord } from './entities/panel-vote.entity';
import { SafetyProbeBattery } from './entities/safety-battery.entity';
import { SafetyRunGrade } from './entities/safety-run-grade.entity';
import { BlindBallot } from './entities/blind-ballot.entity';
import { ProductExperiment } from './entities/experiment.entity';
import { ProductExperimentSubject } from './entities/experiment-subject.entity';
import { ProductAgentEvent } from './entities/agent-event.entity';
import { EvalTrendSample } from './entities/eval-trend.entity';
import { FailureMiningBatch } from './entities/mining-batch.entity';
import { ModelVersion } from './entities/model-version.entity';
import { ModelCard } from './entities/model-card.entity';
import { ModelPromotionEvent } from './entities/promotion-event.entity';
import { ServingScalePlan } from './entities/serving-scale-plan.entity';
import { QuantizationPlanRow } from './entities/quantization-plan.entity';
import { OnDeviceBundle } from './entities/on-device-bundle.entity';
import { RoutingDecision } from './entities/routing-decision.entity';
import { ResponseCacheEntry } from './entities/response-cache-entry.entity';
import { StreamSession } from './entities/stream-session.entity';
import { ServingMetricSample } from './entities/serving-metric-sample.entity';
import { ShadowDeployment } from './entities/shadow-deployment.entity';
import { RollbackEvent } from './entities/rollback-event.entity';
import { ModelPin } from './entities/model-pin.entity';
import { InstanceReservation } from './entities/instance-reservation.entity';
import { OnPremPackage } from './entities/on-prem-package.entity';
import { GatewayProvider } from './entities/gateway-provider.entity';
import { GatewayRouteEvent } from './entities/gateway-route-event.entity';
import { ProviderHealth } from './entities/provider-health.entity';
import { ByokKey } from './entities/byok-key.entity';
import { ProviderUsageSample } from './entities/provider-usage-sample.entity';
import { GatewayLogEntry } from './entities/gateway-log-entry.entity';
import { RetentionPolicy } from './entities/retention-policy.entity';
import { CapabilityMatrix } from './entities/capability-matrix.entity';
import { ToolCallRecord } from './entities/tool-call-record.entity';
import { OutputSchema } from './entities/output-schema.entity';
import { TrainingRun } from './entities/training-run.entity';
import {
  CreateTrainingAssetDto, BuildDatasetDto,
  CreateTrainingRunDto, TransitionRunDto, RecordRunCheckpointDto,
  RecordRunCostDto, RecordRunMetricDto, CompareRunsDto,
  DefineEvalSuiteDto, GradeEvalSuiteDto, RecordPanelVoteDto, ShipGateDto,
  DefineSafetyBatteryDto, GradeSafetyRunDto, GroundClaimsDto,
  CheckContaminationDto, CastBlindVoteDto, TallyBlindVotesDto,
  DefineExperimentDto, AssignVariantDto, RecordExperimentOutcomeDto,
  TallyExperimentDto, RecordAgentEventDto, BuildScorecardsDto,
  RecordTrendSampleDto, BuildTrendDto, MineFailuresDto,
  RegisterModelDto, BuildModelCardDto, PromoteModelDto,
  PlanServingScaleDto, BuildQuantizationDto, BuildBundleDto,
  RoutePromptDto,
  CacheLookupDto, CacheAdmitDto,
  StreamOpenDto, StreamChunkDto, StreamLifecycleDto, StreamResumeDto,
  MetricSampleDto, AggregateMetricsDto,
  ShadowCreateDto, ShadowPairDto, ShadowEvaluateDto,
  RollbackDto,
  PinModelDto, UnpinModelDto, ResolveModelDto,
  ReserveInstancesDto, ReleaseInstancesDto,
  PackageBuildDto, ReimportVerifyDto,
  RegisterProviderDto, GatewayRouteDto, RecordOutcomeDto, FailoverPlanDto,
  ByokRegisterDto, PolicyCheckDto, UsageRecordDto, AccountingDto,
  LogRecordDto, RetentionSetDto, WorkspaceRouteDto,
  CapabilityRegisterDto, CapabilityMatchDto, ToolCallRecordDto,
  OutputSchemaRegisterDto, OutputValidateDto,
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
    @InjectRepository(ProductExperiment)
    private readonly experimentRepository: Repository<ProductExperiment>,
    @InjectRepository(ProductExperimentSubject)
    private readonly experimentSubjectRepository: Repository<ProductExperimentSubject>,
    @InjectRepository(ProductAgentEvent)
    private readonly agentEventRepository: Repository<ProductAgentEvent>,
    @InjectRepository(EvalTrendSample)
    private readonly evalTrendRepository: Repository<EvalTrendSample>,
    @InjectRepository(FailureMiningBatch)
    private readonly miningBatchRepository: Repository<FailureMiningBatch>,
    @InjectRepository(ModelVersion)
    private readonly modelVersionRepository: Repository<ModelVersion>,
    @InjectRepository(ModelCard)
    private readonly modelCardRepository: Repository<ModelCard>,
    @InjectRepository(ModelPromotionEvent)
    private readonly promotionEventRepository: Repository<ModelPromotionEvent>,
    @InjectRepository(ServingScalePlan)
    private readonly servingScalePlanRepository: Repository<ServingScalePlan>,
    @InjectRepository(QuantizationPlanRow)
    private readonly quantizationPlanRepository: Repository<QuantizationPlanRow>,
    @InjectRepository(OnDeviceBundle)
    private readonly onDeviceBundleRepository: Repository<OnDeviceBundle>,
    @InjectRepository(RoutingDecision)
    private readonly routingDecisionRepository: Repository<RoutingDecision>,
    @InjectRepository(ResponseCacheEntry)
    private readonly responseCacheEntryRepository: Repository<ResponseCacheEntry>,
    @InjectRepository(StreamSession)
    private readonly streamSessionRepository: Repository<StreamSession>,
    @InjectRepository(ServingMetricSample)
    private readonly servingMetricSampleRepository: Repository<ServingMetricSample>,
    @InjectRepository(ShadowDeployment)
    private readonly shadowDeploymentRepository: Repository<ShadowDeployment>,
    @InjectRepository(RollbackEvent)
    private readonly rollbackEventRepository: Repository<RollbackEvent>,
    @InjectRepository(ModelPin)
    private readonly modelPinRepository: Repository<ModelPin>,
    @InjectRepository(InstanceReservation)
    private readonly instanceReservationRepository: Repository<InstanceReservation>,
    @InjectRepository(OnPremPackage)
    private readonly onPremPackageRepository: Repository<OnPremPackage>,
    @InjectRepository(GatewayProvider)
    private readonly gatewayProviderRepository: Repository<GatewayProvider>,
    @InjectRepository(GatewayRouteEvent)
    private readonly gatewayRouteEventRepository: Repository<GatewayRouteEvent>,
    @InjectRepository(ProviderHealth)
    private readonly providerHealthRepository: Repository<ProviderHealth>,
    @InjectRepository(ByokKey)
    private readonly byokKeyRepository: Repository<ByokKey>,
    @InjectRepository(ProviderUsageSample)
    private readonly providerUsageSampleRepository: Repository<ProviderUsageSample>,
    @InjectRepository(GatewayLogEntry)
    private readonly gatewayLogEntryRepository: Repository<GatewayLogEntry>,
    @InjectRepository(RetentionPolicy)
    private readonly retentionPolicyRepository: Repository<RetentionPolicy>,
    @InjectRepository(CapabilityMatrix)
    private readonly capabilityMatrixRepository: Repository<CapabilityMatrix>,
    @InjectRepository(ToolCallRecord)
    private readonly toolCallRecordRepository: Repository<ToolCallRecord>,
    @InjectRepository(OutputSchema)
    private readonly outputSchemaRepository: Repository<OutputSchema>,
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

  // --- 7. In-product A/B experiments, scorecards, trends, mining (AI-029..032) ---
  // Experiments are consent-gated ([C]) and deterministic: the same subject
  // lands in the same arm forever. Outcomes are exactly-one-per-subject
  // (double-taps refused by name). Scorecards are computed from the raw
  // event log, never stored mutable. Trend history is append-only. Mining
  // refuses over-cap batches loudly. Zero-trust scoped throughout.

  async defineExperiment(userId: string, dto: DefineExperimentDto): Promise<ProductExperiment> {
    const def = defineExperimentEngine({
      id: dto.experimentId,
      consentGranted: dto.consentGranted,
      variants: dto.variants,
      minSamplesPerVariant: dto.minSamplesPerVariant,
    });
    if (!def.ok) {
      throw new BadRequestException(def.reason);
    }
    const dup = await this.experimentRepository.findOne({
      where: { userId, experimentId: dto.experimentId },
    });
    if (dup) {
      throw new ConflictException('experiment-duplicate:' + dto.experimentId);
    }
    const row = this.experimentRepository.create({
      userId,
      experimentId: dto.experimentId,
      variants: def.value.variants,
      minSamplesPerVariant: def.value.minSamplesPerVariant,
      active: true,
    });
    return this.experimentRepository.save(row);
  }

  async getExperiment(userId: string, experimentId: string): Promise<ProductExperiment> {
    const row = await this.experimentRepository.findOne({
      where: { userId, experimentId },
    });
    if (!row) {
      throw new NotFoundException('experiment-not-found:' + experimentId);
    }
    return row;
  }

  async assignExperimentVariant(userId: string, dto: AssignVariantDto) {
    const exp = await this.getExperiment(userId, dto.experimentId);
    const assignment = assignVariant({
      experimentId: dto.experimentId,
      userId: dto.subjectUserId,
      variants: exp.variants,
      active: exp.active,
      consentGranted: dto.consentGranted,
    });
    if (!assignment.ok) {
      throw new BadRequestException(assignment.reason);
    }
    // The assignment law is deterministic, so a double-tap returns the
    // existing row as-is — never a second row, never a different arm.
    const existing = await this.experimentSubjectRepository.findOne({
      where: { userId, experimentId: dto.experimentId, subjectUserId: dto.subjectUserId },
    });
    if (existing) {
      if (existing.variantId !== assignment.value.variantId) {
        throw new ConflictException('assignment-mismatch:' + existing.variantId + '!=' + assignment.value.variantId);
      }
      return {
        experimentId: dto.experimentId,
        subjectUserId: dto.subjectUserId,
        variantId: existing.variantId,
        bucket: assignment.value.bucket,
      };
    }
    const row = this.experimentSubjectRepository.create({
      userId,
      experimentId: dto.experimentId,
      subjectUserId: dto.subjectUserId,
      variantId: assignment.value.variantId,
      success: null,
    });
    await this.experimentSubjectRepository.save(row);
    return {
      experimentId: dto.experimentId,
      subjectUserId: dto.subjectUserId,
      variantId: assignment.value.variantId,
      bucket: assignment.value.bucket,
    };
  }

  async recordExperimentOutcome(userId: string, dto: RecordExperimentOutcomeDto) {
    await this.getExperiment(userId, dto.experimentId);
    const subject = await this.experimentSubjectRepository.findOne({
      where: { userId, experimentId: dto.experimentId, subjectUserId: dto.subjectUserId },
    });
    if (!subject) {
      throw new BadRequestException('outcome-not-assigned:' + dto.subjectUserId);
    }
    if (subject.success !== null && subject.success !== undefined) {
      throw new ConflictException('outcome-duplicate:' + dto.subjectUserId);
    }
    subject.success = dto.success;
    await this.experimentSubjectRepository.save(subject);
    return {
      experimentId: dto.experimentId,
      subjectUserId: dto.subjectUserId,
      variantId: subject.variantId,
      success: dto.success,
    };
  }

  async tallyExperiment(userId: string, dto: TallyExperimentDto) {
    const exp = await this.getExperiment(userId, dto.experimentId);
    const rows = await this.experimentSubjectRepository.find({
      where: { userId, experimentId: dto.experimentId },
      order: { createdAt: 'ASC' },
    });
    const outcomes = rows
      .filter((r) => r.success === true || r.success === false)
      .map((r) => ({ variantId: r.variantId, userId: r.subjectUserId, success: r.success as boolean }));
    const tally = tallyExperimentEngine({
      variants: exp.variants,
      minSamplesPerVariant: exp.minSamplesPerVariant,
      outcomes,
    });
    if (!tally.ok) {
      throw new BadRequestException(tally.reason);
    }
    return { experimentId: dto.experimentId, ...tally.value };
  }

  async recordAgentEvent(userId: string, dto: RecordAgentEventDto): Promise<ProductAgentEvent> {
    const row = this.agentEventRepository.create({
      userId,
      agentId: dto.agentId,
      outcome: dto.outcome,
      reverted: dto.reverted ?? null,
      approved: dto.approved ?? null,
    });
    return this.agentEventRepository.save(row);
  }

  async buildAgentScorecards(userId: string, dto: BuildScorecardsDto) {
    const where: any = { userId };
    if (dto.agentId) where.agentId = dto.agentId;
    const rows = await this.agentEventRepository.find({ where, order: { createdAt: 'ASC' } });
    const events = rows.map((r) => ({
      agentId: r.agentId,
      outcome: r.outcome,
      ...(r.reverted === null || r.reverted === undefined ? {} : { reverted: r.reverted }),
      ...(r.approved === null || r.approved === undefined ? {} : { approved: r.approved }),
    }));
    const report = buildScorecards({ events, minEventsPerAgent: dto.minEventsPerAgent });
    if (!report.ok) {
      throw new BadRequestException(report.reason);
    }
    return report.value;
  }

  async recordTrendSample(userId: string, dto: RecordTrendSampleDto): Promise<EvalTrendSample> {
    const existing = await this.evalTrendRepository.findOne({
      where: { userId, metricId: dto.metricId, bucket: dto.bucket },
    });
    if (existing) {
      if (existing.score !== dto.score) {
        throw new ConflictException('trend-conflicting-score:' + dto.bucket);
      }
      return existing;
    }
    const row = this.evalTrendRepository.create({
      userId,
      metricId: dto.metricId,
      bucket: dto.bucket,
      score: dto.score,
    });
    return this.evalTrendRepository.save(row);
  }

  async buildEvalTrend(userId: string, dto: BuildTrendDto) {
    const rows = await this.evalTrendRepository.find({
      where: { userId, metricId: dto.metricId },
      order: { bucket: 'ASC' },
    });
    const report = buildTrend({
      samples: rows.map((r) => ({ bucket: r.bucket, score: Number(r.score) })),
      degradeThreshold: dto.degradeThreshold,
    });
    if (!report.ok) {
      throw new BadRequestException(report.reason);
    }
    return { metricId: dto.metricId, ...report.value };
  }

  async mineFailureCases(userId: string, dto: MineFailuresDto): Promise<FailureMiningBatch> {
    const dup = await this.miningBatchRepository.findOne({
      where: { userId, batchId: dto.batchId },
    });
    if (dup) {
      throw new ConflictException('mining-batch-duplicate:' + dto.batchId);
    }
    const batch = mineFailures({ cases: dto.cases, maxMined: dto.maxMined });
    if (!batch.ok) {
      throw new BadRequestException(batch.reason);
    }
    const row = this.miningBatchRepository.create({
      userId,
      batchId: dto.batchId,
      cases: batch.value.cases,
      count: batch.value.count,
      duplicatesDropped: batch.value.duplicatesDropped,
    });
    return this.miningBatchRepository.save(row);
  }

  // --- 8. Model registry, cards, staged promotion (AI-033..035) ---------
  // Registry versions are gap-free and per-model sequential; re-registering
  // the same weights returns the existing row (idempotent), never a silent
  // second version. Cards are honest: missing safety evidence is a caveat,
  // never hidden, and a conflicting card for the same version is refused by
  // name. Promotion is one stage at a time with hard gates; the promotion
  // event is append-only audit. Zero-trust scoped throughout.

  async registerModel(userId: string, dto: RegisterModelDto) {
    const existingRows = await this.modelVersionRepository.find({
      where: { userId, modelId: dto.modelId },
      order: { version: 'ASC' },
    });
    const sameWeights = existingRows.find((r) => r.weightsFingerprint === dto.weightsFingerprint);
    if (sameWeights) {
      return { ...sameWeights, reused: true };
    }
    const verdict = registerModelVersion({
      modelId: dto.modelId,
      owners: dto.owners,
      weightsFingerprint: dto.weightsFingerprint,
      lineage: dto.lineage,
      version: dto.version,
      existingVersions: existingRows.map((r) => r.version),
    });
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    const row = this.modelVersionRepository.create({
      userId,
      modelId: verdict.value.modelId,
      version: verdict.value.version,
      stage: verdict.value.stage,
      owners: verdict.value.owners,
      lineage: verdict.value.lineage,
      weightsFingerprint: verdict.value.weightsFingerprint,
      fingerprint: verdict.value.fingerprint,
    });
    const saved = await this.modelVersionRepository.save(row);
    return { ...saved, reused: false };
  }

  async getModelVersions(userId: string, modelId: string): Promise<ModelVersion[]> {
    const rows = await this.modelVersionRepository.find({
      where: { userId, modelId },
      order: { version: 'ASC' },
    });
    if (rows.length === 0) {
      throw new NotFoundException('registry-model-not-found:' + modelId);
    }
    return rows;
  }

  async getModelVersion(userId: string, modelId: string, version: number): Promise<ModelVersion> {
    const row = await this.modelVersionRepository.findOne({
      where: { userId, modelId, version },
    });
    if (!row) {
      throw new NotFoundException('registry-model-version-not-found:' + modelId + ':' + version);
    }
    return row;
  }

  async buildCardForModel(userId: string, dto: BuildModelCardDto): Promise<ModelCard> {
    const entry = await this.getModelVersion(userId, dto.modelId, dto.version);
    const verdict = buildModelCard({
      entry: {
        modelId: entry.modelId,
        version: entry.version,
        stage: entry.stage,
        owners: entry.owners,
        weightsFingerprint: entry.weightsFingerprint,
        lineage: entry.lineage,
      },
      intendedUse: dto.intendedUse,
      evalScores: dto.evalScores,
      safetyPassRate: dto.safetyPassRate,
      limitations: dto.limitations,
    });
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    const existing = await this.modelCardRepository.findOne({
      where: { userId, modelId: dto.modelId, version: dto.version },
    });
    if (existing) {
      if (existing.card.cardFingerprint === verdict.value.cardFingerprint) {
        return existing;
      }
      throw new ConflictException(
        'card-conflicting-fingerprint:' + existing.card.cardFingerprint + '!=' + verdict.value.cardFingerprint,
      );
    }
    const row = this.modelCardRepository.create({
      userId,
      modelId: dto.modelId,
      version: dto.version,
      card: verdict.value,
    });
    return this.modelCardRepository.save(row);
  }

  async promoteModelVersion(userId: string, dto: PromoteModelDto) {
    const entry = await this.getModelVersion(userId, dto.modelId, dto.version);
    const card = await this.modelCardRepository.findOne({
      where: { userId, modelId: dto.modelId, version: dto.version },
    });
    // Evidence is assembled from durable artifacts, never caller guesses:
    // eval evidence is the best score recorded on the card; safety evidence
    // must be supplied explicitly (a missing number is a named refusal, and
    // a card without safety evidence carries the caveat by law).
    let evalScore: number | undefined;
    if (card && card.card.evaluation.length > 0) {
      evalScore = card.card.evaluation.reduce((m, e) => (e.score > m ? e.score : m), 0);
    }
    const verdict = promoteModel({
      modelId: dto.modelId,
      version: dto.version,
      from: entry.stage,
      to: dto.to,
      evidence: {
        hasCard: Boolean(card),
        evalScore,
        safetyPassRate: dto.safetyPassRate,
      },
    });
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    entry.stage = dto.to;
    await this.modelVersionRepository.save(entry);
    const event = this.promotionEventRepository.create({
      userId,
      modelId: dto.modelId,
      version: dto.version,
      fromStage: verdict.value.from,
      toStage: verdict.value.to,
      promotionFingerprint: verdict.value.promotionFingerprint,
    });
    await this.promotionEventRepository.save(event);
    return {
      modelId: dto.modelId,
      version: dto.version,
      from: verdict.value.from,
      to: verdict.value.to,
      promotionFingerprint: verdict.value.promotionFingerprint,
    };
  }

  // --- 9. Serving: scale plans, quantization, bundles, cascade routing (AI-036..039) ---
  // Scale history is append-only but idempotent: an identical re-plan returns
  // the existing row (reused), a changed plan appends; a refused plan stores
  // nothing — caps and pool limits are engine laws. Quantization and bundle
  // plans are fingerprint-idempotent. Routing decisions are an append-only
  // log: every route is recorded with its chain, costs and truncation truth.
  // Zero-trust scoped throughout.

  async planServingScale(userId: string, dto: PlanServingScaleDto) {
    const verdict = planServingScaleEngine({ ...dto });
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    const rows = await this.servingScalePlanRepository.find({
      where: { userId, modelId: dto.modelId },
      order: { createdAt: 'ASC' },
    });
    const identical = rows.find((r) => JSON.stringify(r.plan) === JSON.stringify(verdict.value));
    if (identical) {
      return { ...identical, reused: true };
    }
    const row = this.servingScalePlanRepository.create({
      userId,
      modelId: dto.modelId,
      plan: verdict.value,
    });
    const saved = await this.servingScalePlanRepository.save(row);
    return { ...saved, reused: false };
  }

  async getServingScalePlans(userId: string, modelId: string): Promise<ServingScalePlan[]> {
    const rows = await this.servingScalePlanRepository.find({
      where: { userId, modelId },
      order: { createdAt: 'ASC' },
    });
    if (rows.length === 0) {
      throw new NotFoundException('serving-plans-not-found:' + modelId);
    }
    return rows;
  }

  async buildQuantization(userId: string, dto: BuildQuantizationDto) {
    const verdict = buildQuantizationPlanEngine({ ...dto });
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    const existing = await this.quantizationPlanRepository.findOne({
      where: { userId, fingerprint: verdict.value.fingerprint },
    });
    if (existing) {
      return { ...existing, reused: true };
    }
    const row = this.quantizationPlanRepository.create({
      userId,
      modelId: verdict.value.modelId,
      method: verdict.value.method,
      fingerprint: verdict.value.fingerprint,
      plan: verdict.value,
    });
    const saved = await this.quantizationPlanRepository.save(row);
    return { ...saved, reused: false };
  }

  async buildBundle(userId: string, dto: BuildBundleDto) {
    const verdict = buildOnDeviceBundleEngine({ ...dto });
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    const existing = await this.onDeviceBundleRepository.findOne({
      where: { userId, fingerprint: verdict.value.fingerprint },
    });
    if (existing) {
      return { ...existing, reused: true };
    }
    const row = this.onDeviceBundleRepository.create({
      userId,
      modelId: verdict.value.modelId,
      runtime: verdict.value.runtime,
      fingerprint: verdict.value.fingerprint,
      bundle: verdict.value,
    });
    const saved = await this.onDeviceBundleRepository.save(row);
    return { ...saved, reused: false };
  }

  async routePrompt(userId: string, dto: RoutePromptDto): Promise<RoutingDecision> {
    const verdict = routeModelEngine({
      promptTokens: dto.promptTokens,
      models: dto.models,
      costCap: dto.costCap,
      confidenceThreshold: dto.confidenceThreshold,
    });
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    const row = this.routingDecisionRepository.create({
      userId,
      promptTokens: verdict.value.promptTokens,
      primary: verdict.value.primary,
      plan: verdict.value,
    });
    return this.routingDecisionRepository.save(row);
  }

  async listRoutingDecisions(userId: string): Promise<RoutingDecision[]> {
    return this.routingDecisionRepository.find({
      where: { userId },
      order: { createdAt: 'ASC' },
    });
  }

  // --- 10. Model operations: cache, streaming, metrics, shadow, rollback (AI-040..044) ---
  // The cache is per-user per-model and fingerprint-idempotent: an exact hit
  // answers free, a cached prefix discounts input processing, and pinned
  // entries are never evicted. Streams are engine-evolved reducer state — a
  // gap, a double-complete or an invented suffix can never reach the DB.
  // Metrics are honest nearest-rank percentiles over raw samples. Shadows
  // freeze the engine verdict only above the sample floor. Rollbacks flip
  // only to previously-served versions, idempotent by fingerprint. Zero-trust
  // scoped throughout: every query carries the owning userId.

  async lookupResponse(userId: string, dto: CacheLookupDto) {
    const rows = await this.responseCacheEntryRepository.find({
      where: { userId, modelId: dto.modelId },
      order: { createdAt: 'ASC' },
    });
    const verdict = lookupResponseCacheEngine({
      modelId: dto.modelId,
      prompt: dto.prompt,
      entries: rows.map((r) => r.entry),
    });
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    return verdict.value;
  }

  async admitResponseCache(userId: string, dto: CacheAdmitDto) {
    const rows = await this.responseCacheEntryRepository.find({
      where: { userId, modelId: dto.modelId },
      order: { createdAt: 'ASC' },
    });
    const verdict = admitCacheEntryEngine({
      modelId: dto.modelId,
      prompt: dto.prompt,
      promptTokens: dto.promptTokens,
      outputTokens: dto.outputTokens,
      maxEntries: dto.maxEntries,
      pinned: dto.pinned,
      now: dto.now ?? Date.now(),
      entries: rows.map((r) => r.entry),
    });
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    const result = verdict.value;
    if (result.duplicate) {
      const existing = rows.find((r) => r.fingerprint === result.admitted.id);
      if (existing) {
        existing.entry = result.admitted;
        const saved = await this.responseCacheEntryRepository.save(existing);
        return { ...saved, duplicate: true, evicted: [] as string[] };
      }
    }
    for (const victim of result.evicted) {
      const row = rows.find((r) => r.entry.id === victim);
      if (row) {
        await this.responseCacheEntryRepository.remove(row);
      }
    }
    const row = this.responseCacheEntryRepository.create({
      userId,
      modelId: dto.modelId,
      fingerprint: result.admitted.id,
      entry: result.admitted,
    });
    const saved = await this.responseCacheEntryRepository.save(row);
    return { ...saved, duplicate: false, evicted: result.evicted };
  }

  async listCacheEntries(userId: string, modelId?: string): Promise<ResponseCacheEntry[]> {
    const where: any = { userId };
    if (modelId) where.modelId = modelId;
    return this.responseCacheEntryRepository.find({ where, order: { createdAt: 'ASC' } });
  }

  async openStream(userId: string, dto: StreamOpenDto) {
    const existing = await this.streamSessionRepository.findOne({
      where: { userId, streamId: dto.streamId },
    });
    if (existing) {
      if (existing.state.status === 'open') {
        return { ...existing, reused: true };
      }
      throw new ConflictException('stream-open-after-' + existing.state.status + ':' + dto.streamId);
    }
    const row = this.streamSessionRepository.create({
      userId,
      streamId: dto.streamId,
      modelId: dto.modelId,
      state: { streamId: dto.streamId, status: 'open', chunks: [] },
    });
    const saved = await this.streamSessionRepository.save(row);
    return { ...saved, reused: false };
  }

  private async evolveStream(userId: string, streamId: string, event: StreamEvent): Promise<StreamSession> {
    const row = await this.streamSessionRepository.findOne({
      where: { userId, streamId },
    });
    if (!row) {
      throw new NotFoundException('stream-not-found:' + streamId);
    }
    const verdict = applyStreamEventEngine(row.state, event);
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    row.state = verdict.value;
    return this.streamSessionRepository.save(row);
  }

  async appendStreamChunk(userId: string, dto: StreamChunkDto): Promise<StreamSession> {
    return this.evolveStream(userId, dto.streamId, { type: 'chunk', index: dto.index, content: dto.content });
  }

  async cancelStream(userId: string, dto: StreamLifecycleDto): Promise<StreamSession> {
    return this.evolveStream(userId, dto.streamId, { type: 'cancel' });
  }

  async completeStream(userId: string, dto: StreamLifecycleDto): Promise<StreamSession> {
    return this.evolveStream(userId, dto.streamId, { type: 'complete' });
  }

  async resumeStream(userId: string, dto: StreamResumeDto) {
    const row = await this.streamSessionRepository.findOne({
      where: { userId, streamId: dto.streamId },
    });
    if (!row) {
      throw new NotFoundException('stream-not-found:' + dto.streamId);
    }
    const verdict = planStreamResumeEngine(row.state, dto.clientLastIndex);
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    return verdict.value;
  }

  async getStream(userId: string, streamId: string): Promise<StreamSession> {
    const row = await this.streamSessionRepository.findOne({
      where: { userId, streamId },
    });
    if (!row) {
      throw new NotFoundException('stream-not-found:' + streamId);
    }
    return row;
  }

  async recordServingMetric(userId: string, dto: MetricSampleDto): Promise<ServingMetricSample> {
    const row = this.servingMetricSampleRepository.create({
      userId,
      modelId: dto.modelId,
      sample: {
        latencyMs: dto.latencyMs,
        tokens: dto.tokens,
        costUsd: dto.costUsd,
        ok: dto.ok,
        ttftMs: dto.ttftMs,
      },
    });
    return this.servingMetricSampleRepository.save(row);
  }

  async buildServingMetrics(userId: string, dto: AggregateMetricsDto) {
    const rows = await this.servingMetricSampleRepository.find({
      where: { userId, modelId: dto.modelId },
      order: { createdAt: 'ASC' },
    });
    const verdict = aggregateServingMetricsEngine({
      modelId: dto.modelId,
      samples: rows.map((r) => r.sample),
      latencyBudgetMs: dto.latencyBudgetMs,
    });
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    return verdict.value;
  }

  async listServingMetricSamples(userId: string, modelId?: string): Promise<ServingMetricSample[]> {
    const where: any = { userId };
    if (modelId) where.modelId = modelId;
    return this.servingMetricSampleRepository.find({ where, order: { createdAt: 'ASC' } });
  }

  async createShadowDeployment(userId: string, dto: ShadowCreateDto): Promise<ShadowDeployment> {
    if (dto.championId === dto.challengerId) {
      throw new BadRequestException('shadow-same-model:' + dto.championId);
    }
    const dup = await this.shadowDeploymentRepository.findOne({
      where: { userId, championId: dto.championId, challengerId: dto.challengerId },
    });
    if (dup) {
      throw new ConflictException('shadow-deployment-duplicate:' + dto.championId + ':' + dto.challengerId);
    }
    const row = this.shadowDeploymentRepository.create({
      userId,
      championId: dto.championId,
      challengerId: dto.challengerId,
      status: 'shadowing',
      pairs: [],
      result: null,
    });
    return this.shadowDeploymentRepository.save(row);
  }

  async recordShadowPair(userId: string, dto: ShadowPairDto): Promise<ShadowDeployment> {
    const row = await this.shadowDeploymentRepository.findOne({
      where: { userId, championId: dto.championId, challengerId: dto.challengerId },
    });
    if (!row) {
      throw new NotFoundException('shadow-deployment-not-found:' + dto.championId + ':' + dto.challengerId);
    }
    if (row.status !== 'shadowing') {
      throw new ConflictException('shadow-pair-after-' + row.status + ':' + dto.championId);
    }
    row.pairs = [...row.pairs, { agree: dto.agree }];
    return this.shadowDeploymentRepository.save(row);
  }

  async evaluateShadowDeployment(userId: string, dto: ShadowEvaluateDto) {
    const row = await this.shadowDeploymentRepository.findOne({
      where: { userId, championId: dto.championId, challengerId: dto.challengerId },
    });
    if (!row) {
      throw new NotFoundException('shadow-deployment-not-found:' + dto.championId + ':' + dto.challengerId);
    }
    const verdict = evaluateShadowEngine({
      championId: dto.championId,
      challengerId: dto.challengerId,
      pairs: row.pairs,
      agreementThreshold: dto.agreementThreshold,
    });
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    row.result = verdict.value;
    if (verdict.value.verdict === 'promote-shadow') {
      row.status = 'promoted';
    }
    await this.shadowDeploymentRepository.save(row);
    return verdict.value;
  }

  async listShadowDeployments(userId: string, championId?: string): Promise<ShadowDeployment[]> {
    const where: any = { userId };
    if (championId) where.championId = championId;
    return this.shadowDeploymentRepository.find({ where, order: { createdAt: 'ASC' } });
  }

  async rollbackModelVersion(userId: string, dto: RollbackDto) {
    const verdict = planRollbackEngine({
      modelId: dto.modelId,
      currentVersion: dto.currentVersion,
      targetVersion: dto.targetVersion,
      servedVersions: dto.servedVersions,
    });
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    const rows = await this.rollbackEventRepository.find({
      where: { userId, modelId: dto.modelId },
      order: { createdAt: 'ASC' },
    });
    const identical = rows.find((r) => JSON.stringify(r.plan) === JSON.stringify(verdict.value));
    if (identical) {
      return { ...identical, reused: true };
    }
    const row = this.rollbackEventRepository.create({
      userId,
      modelId: dto.modelId,
      plan: verdict.value,
    });
    const saved = await this.rollbackEventRepository.save(row);
    return { ...saved, reused: false };
  }

  async listRollbackEvents(userId: string, modelId?: string): Promise<RollbackEvent[]> {
    const where: any = { userId };
    if (modelId) where.modelId = modelId;
    return this.rollbackEventRepository.find({ where, order: { createdAt: 'ASC' } });
  }

  // --- 11. Workspace model access: pins, dedicated instances, on-prem packages (AI-045..047) ---
  // A pin freezes which exact version serves a workspace and keeps the
  // switch-back trace (GP-016); the tier law is per model in the registry,
  // never a blanket plan tier (MT-104). Dedicated instances refuse
  // over-commit by name with exact free-capacity arithmetic — the shared
  // pool is capacity truth, never silently downsized. On-prem packages
  // only leave with card, license and weights attached (SY), and re-import
  // passes the same gates that allowed export. Zero-trust scoped.

  async pinWorkspaceModel(userId: string, dto: PinModelDto) {
    const versions = await this.modelVersionRepository.find({
      where: { userId, modelId: dto.modelId },
      order: { version: 'ASC' },
    });
    const existing = await this.modelPinRepository.findOne({
      where: { userId, workspaceId: dto.workspaceId, modelId: dto.modelId },
    });
    const verdict = pinModelEngine({
      workspaceId: dto.workspaceId,
      modelId: dto.modelId,
      versionId: dto.versionId,
      modelTier: dto.modelTier,
      planTiers: dto.planTiers,
      versions: versions.map((r) => r.version),
      existingPin: existing ? existing.pin : null,
    });
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    if (verdict.value.duplicate && existing) {
      return { ...existing, duplicate: true };
    }
    if (existing) {
      existing.pin = verdict.value;
      existing.fingerprint = verdict.value.fingerprint;
      const saved = await this.modelPinRepository.save(existing);
      return { ...saved, duplicate: false };
    }
    const row = this.modelPinRepository.create({
      userId,
      workspaceId: dto.workspaceId,
      modelId: dto.modelId,
      pin: verdict.value,
      fingerprint: verdict.value.fingerprint,
    });
    const saved = await this.modelPinRepository.save(row);
    return { ...saved, duplicate: false };
  }

  async unpinWorkspaceModel(userId: string, dto: UnpinModelDto) {
    const existing = await this.modelPinRepository.findOne({
      where: { userId, workspaceId: dto.workspaceId, modelId: dto.modelId },
    });
    const verdict = unpinModelEngine({
      workspaceId: dto.workspaceId,
      modelId: dto.modelId,
      currentPin: existing ? existing.pin : null,
    });
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    await this.modelPinRepository.remove(existing!);
    return verdict.value;
  }

  async listWorkspacePins(userId: string, workspaceId?: string): Promise<ModelPin[]> {
    const where: any = { userId };
    if (workspaceId) where.workspaceId = workspaceId;
    return this.modelPinRepository.find({ where, order: { createdAt: 'ASC' } });
  }

  async resolveWorkspaceModel(userId: string, dto: ResolveModelDto) {
    const pins = await this.modelPinRepository.find({
      where: { userId, workspaceId: dto.workspaceId },
      order: { createdAt: 'ASC' },
    });
    let fallbackVersionId: number | undefined = dto.fallbackVersionId;
    if (fallbackVersionId === undefined) {
      const rows = await this.modelVersionRepository.find({
        where: { userId, modelId: dto.modelId },
        order: { version: 'DESC' },
      });
      if (rows.length > 0) fallbackVersionId = rows[0].version;
    }
    const verdict = resolvePinnedModelEngine({
      workspaceId: dto.workspaceId,
      modelId: dto.modelId,
      pins: pins.map((r) => r.pin),
      fallbackVersionId,
    });
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    return verdict.value;
  }

  async reserveDedicatedInstances(userId: string, dto: ReserveInstancesDto) {
    const own = await this.instanceReservationRepository.findOne({
      where: { userId, workspaceId: dto.workspaceId, modelId: dto.modelId },
    });
    // The pool is shared infrastructure: other users' reservations count
    // against free capacity. This is capacity accounting, not data
    // exposure — no other user's rows are ever returned.
    const others = await this.instanceReservationRepository.find({
      where: { modelId: dto.modelId },
      order: { createdAt: 'ASC' },
    });
    const reservedByOthers = others
      .filter((r) => r.userId !== userId)
      .reduce((sum, r) => sum + (r.reservation?.slots ?? 0), 0);
    const verdict = reserveInstancesEngine({
      workspaceId: dto.workspaceId,
      modelId: dto.modelId,
      slots: dto.slots,
      poolTotal: dto.poolTotal,
      reservedByOthers,
      currentReservation: own ? own.reservation : null,
    });
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    if (verdict.value.duplicate && own) {
      return { ...own, duplicate: true };
    }
    if (own) {
      own.reservation = verdict.value;
      own.fingerprint = verdict.value.fingerprint;
      const saved = await this.instanceReservationRepository.save(own);
      return { ...saved, duplicate: false };
    }
    const row = this.instanceReservationRepository.create({
      userId,
      workspaceId: dto.workspaceId,
      modelId: dto.modelId,
      reservation: verdict.value,
      fingerprint: verdict.value.fingerprint,
    });
    const saved = await this.instanceReservationRepository.save(row);
    return { ...saved, duplicate: false };
  }

  async releaseDedicatedInstances(userId: string, dto: ReleaseInstancesDto) {
    const own = await this.instanceReservationRepository.findOne({
      where: { userId, workspaceId: dto.workspaceId, modelId: dto.modelId },
    });
    const verdict = releaseInstancesEngine({
      workspaceId: dto.workspaceId,
      modelId: dto.modelId,
      currentReservation: own ? own.reservation : null,
    });
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    await this.instanceReservationRepository.remove(own!);
    return verdict.value;
  }

  async listInstanceReservations(userId: string, modelId?: string): Promise<InstanceReservation[]> {
    const where: any = { userId };
    if (modelId) where.modelId = modelId;
    return this.instanceReservationRepository.find({ where, order: { createdAt: 'ASC' } });
  }

  async buildOnPremPackageForModel(userId: string, dto: PackageBuildDto) {
    const entry = await this.getModelVersion(userId, dto.modelId, dto.versionId);
    const card = await this.modelCardRepository.findOne({
      where: { userId, modelId: dto.modelId, version: dto.versionId },
    });
    const verdict = buildOnPremPackageEngine({
      modelId: dto.modelId,
      versionId: dto.versionId,
      stage: entry.stage,
      weightsFingerprint: entry.weightsFingerprint,
      hasCard: Boolean(card),
      licenseTerms: dto.licenseTerms,
      quantized: dto.quantized,
    });
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    const existing = await this.onPremPackageRepository.findOne({
      where: { userId, fingerprint: verdict.value.fingerprint },
    });
    if (existing) {
      return { ...existing, reused: true };
    }
    const row = this.onPremPackageRepository.create({
      userId,
      modelId: dto.modelId,
      pkg: verdict.value,
      fingerprint: verdict.value.fingerprint,
    });
    const saved = await this.onPremPackageRepository.save(row);
    return { ...saved, reused: false };
  }

  async verifyOnPremReimport(userId: string, dto: ReimportVerifyDto) {
    const rows = await this.onPremPackageRepository.find({
      where: { userId, modelId: dto.modelId },
      order: { createdAt: 'ASC' },
    });
    const pkgRow = rows.find((r) => r.pkg.versionId === dto.versionId && r.pkg.quantized === dto.quantized);
    const verdict = verifyReimportEngine({
      pkg: pkgRow ? pkgRow.pkg : null,
      weightsFingerprint: dto.weightsFingerprint,
      qualityScore: dto.qualityScore,
      qualityGate: dto.qualityGate,
      licenseAccepted: dto.licenseAccepted,
    });
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    // Verification stores nothing: acceptance is a decision, not a row.
    return verdict.value;
  }

  async listOnPremPackages(userId: string, modelId?: string): Promise<OnPremPackage[]> {
    const where: any = { userId };
    if (modelId) where.modelId = modelId;
    return this.onPremPackageRepository.find({ where, order: { createdAt: 'ASC' } });
  }
  // --- AI-048..052: provider-neutral model gateway, circuit health, BYOK,
  // data policy, honest accounting ---

  async registerGatewayProvider(userId: string, dto: RegisterProviderDto) {
    const descriptor: ProviderDescriptor = {
      id: dto.providerId,
      costPer1kIn: dto.costPer1kIn,
      costPer1kOut: dto.costPer1kOut,
      maxTokens: dto.maxTokens,
      active: dto.active ?? true,
      ...(dto.retentionDays !== undefined ? { retentionDays: dto.retentionDays } : {}),
    };
    const fingerprint = byokFingerprint(
      dto.providerId,
      [descriptor.costPer1kIn, descriptor.costPer1kOut, descriptor.maxTokens, descriptor.active].join(':'),
    );
    const existing = await this.gatewayProviderRepository.findOne({
      where: { userId, providerId: dto.providerId },
    });
    if (existing) {
      existing.provider = descriptor;
      existing.fingerprint = fingerprint;
      const saved = await this.gatewayProviderRepository.save(existing);
      return { ...saved, duplicate: false };
    }
    const row = this.gatewayProviderRepository.create({
      userId,
      providerId: dto.providerId,
      provider: descriptor,
      fingerprint,
    });
    const saved = await this.gatewayProviderRepository.save(row);
    return { ...saved, duplicate: false };
  }

  async listGatewayProviders(userId: string): Promise<GatewayProvider[]> {
    return this.gatewayProviderRepository.find({ where: { userId }, order: { createdAt: 'ASC' } });
  }

  async routeGatewayRequest(userId: string, dto: GatewayRouteDto) {
    const rows = await this.gatewayProviderRepository.find({
      where: { userId },
      order: { createdAt: 'ASC' },
    });
    const verdict = planGatewayRouteEngine({
      providers: rows.map((r) => r.provider),
      promptTokens: dto.promptTokens,
      outputTokens: dto.outputTokens,
    });
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    const fingerprint = byokFingerprint(
      verdict.value.primaryId,
      verdict.value.chain.join('|') + '|' + verdict.value.estimatedCostUsd,
    );
    const row = this.gatewayRouteEventRepository.create({
      userId,
      route: verdict.value,
      fingerprint,
    });
    await this.gatewayRouteEventRepository.save(row);
    return { ...verdict.value, fingerprint };
  }

  async recordProviderOutcome(userId: string, dto: RecordOutcomeDto) {
    const existing = await this.providerHealthRepository.findOne({
      where: { userId, providerId: dto.providerId },
    });
    const verdict = recordProviderHealthEngine({
      providerId: dto.providerId,
      consecutiveFailures: existing ? existing.health.consecutiveFailures : 0,
      ok: dto.ok,
    });
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    if (existing) {
      existing.health = verdict.value;
      const saved = await this.providerHealthRepository.save(existing);
      return saved.health;
    }
    const row = this.providerHealthRepository.create({
      userId,
      providerId: dto.providerId,
      health: verdict.value,
    });
    const saved = await this.providerHealthRepository.save(row);
    return saved.health;
  }

  async listProviderHealth(userId: string): Promise<ProviderHealthState[]> {
    const rows = await this.providerHealthRepository.find({ where: { userId }, order: { createdAt: 'ASC' } });
    return rows.map((r) => r.health);
  }

  async planGatewayFailover(userId: string, dto: FailoverPlanDto) {
    const providerRows = await this.gatewayProviderRepository.find({
      where: { userId },
      order: { createdAt: 'ASC' },
    });
    const healthRows = await this.providerHealthRepository.find({ where: { userId } });
    const health: Record<string, number> = {};
    for (const row of healthRows) {
      health[row.providerId] = row.health.consecutiveFailures;
    }
    const verdict = planFailoverChainEngine({
      providers: providerRows.map((r) => r.provider),
      health,
      maxRetriesPerProvider: dto.maxRetriesPerProvider,
      promptTokens: dto.promptTokens,
      outputTokens: dto.outputTokens,
    });
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    return verdict.value;
  }

  async registerWorkspaceKey(userId: string, dto: ByokRegisterDto) {
    const keyVerdict = validateByokKeyEngine(dto.apiKey);
    if (!keyVerdict.ok) {
      throw new BadRequestException(keyVerdict.reason);
    }
    const fingerprint = byokFingerprint(dto.providerId, dto.apiKey.trim());
    const meta: ByokKeyMeta = {
      providerId: dto.providerId,
      keyLength: keyVerdict.value.keyLength,
      fingerprint,
    };
    const existing = await this.byokKeyRepository.findOne({
      where: { userId, workspaceId: dto.workspaceId, providerId: dto.providerId },
    });
    if (existing) {
      existing.key = meta;
      existing.fingerprint = fingerprint;
      const saved = await this.byokKeyRepository.save(existing);
      return { workspaceId: saved.workspaceId, providerId: saved.providerId, key: saved.key };
    }
    const row = this.byokKeyRepository.create({
      userId,
      workspaceId: dto.workspaceId,
      providerId: dto.providerId,
      key: meta,
      fingerprint,
    });
    const saved = await this.byokKeyRepository.save(row);
    // The raw key NEVER survives this method — only its fingerprint does (AI-050).
    return { workspaceId: saved.workspaceId, providerId: saved.providerId, key: saved.key };
  }

  async listWorkspaceKeys(userId: string, workspaceId: string) {
    const rows = await this.byokKeyRepository.find({
      where: { userId, workspaceId },
      order: { createdAt: 'ASC' },
    });
    return rows.map((r) => ({ workspaceId: r.workspaceId, providerId: r.providerId, key: r.key }));
  }

  async checkDataPolicy(_userId: string, dto: PolicyCheckDto) {
    const verdict = enforceDataPolicyEngine({
      dataTags: dto.dataTags,
      providerClearance: dto.providerClearance,
    });
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    // Policy checks are stateless: a decision, not a row.
    return verdict.value;
  }

  async recordProviderUsage(userId: string, dto: UsageRecordDto) {
    const provider = await this.gatewayProviderRepository.findOne({
      where: { userId, providerId: dto.providerId },
    });
    if (!provider) {
      throw new NotFoundException('gateway-provider-not-found:' + dto.providerId);
    }
    const sample: UsageSample = {
      tokensIn: dto.tokensIn,
      tokensOut: dto.tokensOut,
      latencyMs: dto.latencyMs,
      ok: dto.ok ?? true,
    };
    const row = this.providerUsageSampleRepository.create({
      userId,
      providerId: dto.providerId,
      sample,
    });
    await this.providerUsageSampleRepository.save(row);
    return { recorded: true, sample };
  }

  async buildProviderAccounting(userId: string, dto: AccountingDto) {
    const provider = await this.gatewayProviderRepository.findOne({
      where: { userId, providerId: dto.providerId },
    });
    if (!provider) {
      throw new NotFoundException('gateway-provider-not-found:' + dto.providerId);
    }
    const rows = await this.providerUsageSampleRepository.find({
      where: { userId, providerId: dto.providerId },
      order: { createdAt: 'ASC' },
    });
    const verdict = aggregateProviderUsageEngine({
      providerId: dto.providerId,
      descriptor: {
        costPer1kIn: provider.provider.costPer1kIn,
        costPer1kOut: provider.provider.costPer1kOut,
      },
      samples: rows.map((r) => r.sample),
    });
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    return verdict.value;
  }

  // --- AI-053..056: gateway logging with redaction, zero-retention
  // routing, capability registry, unified tool-calling + structured
  // output ---
  // Every log is redacted BEFORE it is stored and is fingerprint-
  // idempotent over raw content; a zero-retention workspace stores no
  // prompt/response content at all — the redaction evidence is kept,
  // the words are not. Capability routing matches registered matrices,
  // never marketing names. Tool calls normalize to one shape and
  // outputs validate against registered schemas with named refusals.
  // Refusals store nothing. Zero-trust scoped throughout.

  async recordGatewayLog(userId: string, dto: LogRecordDto): Promise<GatewayLogEntry & { duplicate: boolean }> {
    let persistContent = true;
    if (dto.workspaceId) {
      const policy = await this.retentionPolicyRepository.findOne({
        where: { userId, workspaceId: dto.workspaceId },
      });
      const retention = planLogRetentionEngine({
        workspaceRetentionMode: policy ? policy.mode : 'standard',
      });
      if (!retention.ok) {
        throw new BadRequestException(retention.reason);
      }
      persistContent = retention.value.persistContent;
    }
    const entries = await this.gatewayLogEntryRepository.find({
      where: { userId, modelId: dto.modelId },
      order: { createdAt: 'ASC' },
    });
    const verdict = admitGatewayLogEngine({
      providerId: dto.providerId,
      modelId: dto.modelId,
      prompt: dto.prompt,
      response: dto.response,
      persistContent,
      now: Date.now(),
      entries: entries.map((r) => r.entry),
    });
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    const result = verdict.value;
    if (result.duplicate) {
      const existing = entries.find((r) => r.fingerprint === result.admitted.id);
      if (existing) {
        return { ...existing, duplicate: true };
      }
    }
    const row = this.gatewayLogEntryRepository.create({
      userId,
      providerId: dto.providerId,
      modelId: dto.modelId,
      fingerprint: result.admitted.id,
      entry: result.admitted,
      redactionCount: result.admitted.redactionCount,
    });
    const saved = await this.gatewayLogEntryRepository.save(row);
    return { ...saved, duplicate: false };
  }

  async listGatewayLogs(userId: string, providerId?: string): Promise<GatewayLogEntry[]> {
    const where: any = { userId };
    if (providerId) where.providerId = providerId;
    return this.gatewayLogEntryRepository.find({ where, order: { createdAt: 'ASC' } });
  }

  async setWorkspaceRetention(userId: string, dto: RetentionSetDto): Promise<RetentionPolicy & { reused: boolean }> {
    const verdict = planLogRetentionEngine({ workspaceRetentionMode: dto.mode });
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    const existing = await this.retentionPolicyRepository.findOne({
      where: { userId, workspaceId: dto.workspaceId },
    });
    if (existing) {
      if (existing.mode === dto.mode) {
        return { ...existing, reused: true };
      }
      existing.mode = dto.mode;
      existing.policy = verdict.value;
      const saved = await this.retentionPolicyRepository.save(existing);
      return { ...saved, reused: false };
    }
    const row = this.retentionPolicyRepository.create({
      userId,
      workspaceId: dto.workspaceId,
      mode: dto.mode,
      policy: verdict.value,
    });
    const saved = await this.retentionPolicyRepository.save(row);
    return { ...saved, reused: false };
  }

  async getWorkspaceRetention(userId: string, workspaceId: string): Promise<RetentionPolicy> {
    const row = await this.retentionPolicyRepository.findOne({
      where: { userId, workspaceId },
    });
    if (!row) {
      throw new NotFoundException('retention-policy-not-found:' + workspaceId);
    }
    return row;
  }

  async routeWorkspaceRequest(userId: string, dto: WorkspaceRouteDto) {
    const policy = await this.retentionPolicyRepository.findOne({
      where: { userId, workspaceId: dto.workspaceId },
    });
    const providers = await this.gatewayProviderRepository.find({
      where: { userId },
      order: { createdAt: 'ASC' },
    });
    const verdict = planZeroRetentionRouteEngine({
      providers: providers.map((r) => r.provider),
      workspaceRetentionMode: policy ? policy.mode : 'standard',
      promptTokens: dto.promptTokens,
      outputTokens: dto.outputTokens,
    });
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    // Retention routing is stateless: the decision, not a row.
    return verdict.value;
  }

  async registerCapability(userId: string, dto: CapabilityRegisterDto): Promise<CapabilityMatrix & { duplicate: boolean }> {
    const rows = await this.capabilityMatrixRepository.find({
      where: { userId, modelId: dto.modelId },
      order: { createdAt: 'ASC' },
    });
    const verdict = registerCapabilityMatrixEngine({
      modelId: dto.modelId,
      capabilities: dto.capabilities,
      maxContextTokens: dto.maxContextTokens,
      costPer1kIn: dto.costPer1kIn,
      costPer1kOut: dto.costPer1kOut,
      active: dto.active ?? true,
      existing: rows.map((r) => r.matrix),
    });
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    const result = verdict.value;
    if (result.duplicate) {
      const existing = rows.find((r) => r.fingerprint === result.fingerprint);
      if (existing) {
        return { ...existing, duplicate: true };
      }
    }
    const row = this.capabilityMatrixRepository.create({
      userId,
      modelId: dto.modelId,
      fingerprint: result.fingerprint,
      matrix: result.matrix,
    });
    const saved = await this.capabilityMatrixRepository.save(row);
    return { ...saved, duplicate: false };
  }

  async listCapabilityMatrices(userId: string, modelId?: string): Promise<CapabilityMatrix[]> {
    const where: any = { userId };
    if (modelId) where.modelId = modelId;
    return this.capabilityMatrixRepository.find({ where, order: { createdAt: 'ASC' } });
  }

  async matchModelCapabilities(userId: string, dto: CapabilityMatchDto) {
    const rows = await this.capabilityMatrixRepository.find({
      where: { userId },
      order: { createdAt: 'ASC' },
    });
    const verdict = matchModelCapabilitiesEngine({
      required: dto.required,
      models: rows.map((r) => r.matrix),
      promptTokens: dto.promptTokens,
      outputTokens: dto.outputTokens,
    });
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    // Capability matching is stateless: a decision, not a row.
    return verdict.value;
  }

  async recordToolCall(userId: string, dto: ToolCallRecordDto): Promise<ToolCallRecord & { duplicate: boolean }> {
    const verdict = normalizeToolCallEngine({
      providerId: dto.providerId,
      name: dto.name,
      argumentsJson: dto.argumentsJson,
      args: dto.args,
    });
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    const existing = await this.toolCallRecordRepository.findOne({
      where: { userId, fingerprint: verdict.value.fingerprint },
    });
    if (existing) {
      return { ...existing, duplicate: true };
    }
    const row = this.toolCallRecordRepository.create({
      userId,
      providerId: dto.providerId,
      fingerprint: verdict.value.fingerprint,
      call: verdict.value,
    });
    const saved = await this.toolCallRecordRepository.save(row);
    return { ...saved, duplicate: false };
  }

  async listToolCalls(userId: string, providerId?: string): Promise<ToolCallRecord[]> {
    const where: any = { userId };
    if (providerId) where.providerId = providerId;
    return this.toolCallRecordRepository.find({ where, order: { createdAt: 'ASC' } });
  }

  async registerOutputSchema(userId: string, dto: OutputSchemaRegisterDto): Promise<OutputSchema & { reused: boolean }> {
    const rows = await this.outputSchemaRepository.find({
      where: { userId, schemaId: dto.schemaId },
      order: { createdAt: 'ASC' },
    });
    const verdict = registerOutputSchemaEngine({
      schemaId: dto.schemaId,
      fields: dto.fields,
      existing: rows.map((r) => r.schema),
    });
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    const result = verdict.value;
    if (result.duplicate) {
      const existing = rows.find((r) => r.fingerprint === result.fingerprint);
      if (existing) {
        return { ...existing, reused: true };
      }
    }
    const row = this.outputSchemaRepository.create({
      userId,
      schemaId: dto.schemaId,
      fingerprint: result.fingerprint,
      schema: result.schema,
    });
    const saved = await this.outputSchemaRepository.save(row);
    return { ...saved, reused: false };
  }

  async listOutputSchemas(userId: string, schemaId?: string): Promise<OutputSchema[]> {
    const where: any = { userId };
    if (schemaId) where.schemaId = schemaId;
    return this.outputSchemaRepository.find({ where, order: { createdAt: 'ASC' } });
  }

  async validateOutputAgainstSchema(userId: string, dto: OutputValidateDto) {
    const rows = await this.outputSchemaRepository.find({
      where: { userId, schemaId: dto.schemaId },
      order: { createdAt: 'ASC' },
    });
    if (rows.length === 0) {
      throw new NotFoundException('output-schema-not-found:' + dto.schemaId);
    }
    const verdict = validateStructuredOutputEngine({
      fields: rows[rows.length - 1].schema.fields,
      output: dto.output,
    });
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    // Output validation is stateless: a verdict, not a row.
    return verdict.value;
  }
}
