// ============================================================================
// FILE: /apps/api/src/modules/ai-training/dto/ai-training.dto.ts
// ============================================================================

import { IsString, IsEnum, IsBoolean, IsInt, IsOptional, IsArray, MaxLength, MinLength, Min, Max, ArrayMaxSize, IsUUID, IsNumber, IsIn, IsObject, ValidateNested, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';
import { TrainingAssetKind, TrainingClassification } from '../entities/training-asset.entity';

export class CreateTrainingAssetDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title: string;

  @IsEnum(TrainingAssetKind)
  kind: TrainingAssetKind;

  @IsEnum(TrainingClassification)
  classification: TrainingClassification;

  @IsBoolean()
  consent: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  quality?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100_000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  storageKey?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  tags?: string[];
}

export class BuildDatasetDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  name: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  tags?: string[];

  /** Optional parent snapshot id to chain the new version from. */
  @IsOptional()
  @IsString()
  parentSnapshotId?: string;
}

// --- Training runs (AI-013/014/017/018/019/020) ---

export class CreateTrainingRunDto {
  @IsUUID()
  datasetId: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  epochs?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(512)
  batchSize?: number;

  /** Hard budget cap for the whole run, in credit units. */
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  budget: number;

  /** Cost per training step, in credit units. */
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  costPerStep: number;

  @IsInt()
  @Min(0)
  seed: number;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  codeVersion: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  environment: string;

  @IsOptional()
  @IsObject()
  hyperparams?: Record<string, any>;
}

export class TransitionRunDto {
  @IsIn(['planned', 'running', 'paused', 'succeeded', 'failed', 'canceled'])
  to: string;
}

export class RecordRunCheckpointDto {
  @IsInt()
  @Min(0)
  step: number;

  @IsNumber()
  loss: number;
}

export class RecordRunCostDto {
  @IsInt()
  @Min(0)
  step: number;

  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  units: number;
}

export class RecordRunMetricDto {
  @IsInt()
  @Min(0)
  step: number;

  @IsNumber()
  loss: number;

  @IsOptional()
  @IsNumber()
  evalScore?: number;
}

export class CompareRunsDto {
  @IsUUID()
  runAId: string;

  @IsUUID()
  runBId: string;
}

// --- Eval harness (AI-021..024) ---

export class EvalCaseDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  id: string;

  @IsOptional()
  @IsIn(['code-fix', 'code-review', 'incident-diagnosis', 'deploy-decision', 'manhwa', 'music', 'voice'])
  domain?: string;

  /** Forge cases must list criteria (engine refuses empty by name); creative cases may be empty. */
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(50)
  criteria: string[];

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  weight?: number;
}

export class DefineEvalSuiteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  suiteId: string;

  @IsInt()
  @Min(1)
  version: number;

  @IsIn(['forge', 'creative'])
  kind: string;

  @IsArray()
  @ArrayMaxSize(200)
  cases: EvalCaseDto[];
}

export class GradeEvalSuiteDto {
  /** Omit to grade the latest version. */
  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;

  /** caseId -> PASSED criteria ids; validated by the engine law. */
  @IsObject()
  results: Record<string, string[]>;
}

export class RecordPanelVoteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  suiteId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  caseId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  panelist: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  score: number;
}

export class ShipGateDto {
  @IsObject()
  metrics: Record<string, number>;

  @IsObject()
  thresholds: Record<string, { min?: number; baseline?: number; maxDrop?: number }>;
}

// ============================================================================
// AI-025..028: safety evals, grounding, contamination, blind comparison
// ============================================================================

export class SafetyProbeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  id: string;

  @IsString()
  @MinLength(1)
  @MaxLength(512)
  prompt: string;

  @IsBoolean()
  mustRefuse: boolean;
}

export class DefineSafetyBatteryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  batteryId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => SafetyProbeDto)
  probes: SafetyProbeDto[];
}

export class SafetyResponseDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  probeId: string;

  @IsBoolean()
  refused: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  response?: string;
}

export class GradeSafetyRunDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => SafetyResponseDto)
  responses: SafetyResponseDto[];
}

export class GroundClaimDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  id: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  text: string;
}

export class GroundFactDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  id: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  text: string;
}

export class GroundClaimsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => GroundClaimDto)
  claims: GroundClaimDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => GroundFactDto)
  facts?: GroundFactDto[];

  @IsNumber()
  @Min(0)
  @Max(500)
  maxUngrounded: number;
}

export class CorpusDocDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  id: string;

  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  text: string;
}

export class CheckContaminationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  text: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CorpusDocDto)
  corpus: CorpusDocDto[];

  @IsOptional()
  @IsInt()
  @Min(3)
  @Max(12)
  n?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.000001)
  @Max(1)
  threshold?: number;
}

export class CastBlindVoteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  contestId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  voterId: string;

  @IsIn(['a', 'b', 'tie'])
  preference: 'a' | 'b' | 'tie';
}

export class TallyBlindVotesDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  contestId: string;

  @IsInt()
  @Min(1)
  @Max(1000)
  votesRequired: number;
}

// ============================================================================
// AI-029..032: in-product A/B experiments, agent scorecards, eval trends,
// failure mining
// ============================================================================

export class ExperimentVariantDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  id: string;

  @IsInt()
  @Min(1)
  @Max(100)
  splitPercent: number;
}

export class DefineExperimentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  experimentId: string;

  /** The [C] consent law: no consent, no experiment — the engine refuses by name. */
  @IsBoolean()
  consentGranted: boolean;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => ExperimentVariantDto)
  variants: ExperimentVariantDto[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  minSamplesPerVariant?: number;
}

export class AssignVariantDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  experimentId: string;

  @IsUUID()
  subjectUserId: string;

  /** Per-subject consent — declined consent refuses assignment by name. */
  @IsBoolean()
  consentGranted: boolean;
}

export class RecordExperimentOutcomeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  experimentId: string;

  @IsUUID()
  subjectUserId: string;

  @IsBoolean()
  success: boolean;
}

export class TallyExperimentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  experimentId: string;
}

export class RecordAgentEventDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  agentId: string;

  @IsIn(['success', 'failure'])
  outcome: 'success' | 'failure';

  @IsOptional()
  @IsBoolean()
  reverted?: boolean;

  @IsOptional()
  @IsBoolean()
  approved?: boolean;
}

export class BuildScorecardsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  minEventsPerAgent?: number;

  /** Filter to a single agent; omit for the full roster. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  agentId?: string;
}

export class RecordTrendSampleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  metricId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  bucket: string;

  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  @Max(1)
  score: number;
}

export class BuildTrendDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  metricId: string;

  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  @Max(1)
  degradeThreshold: number;
}

export class MinedCaseDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  id: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100_000)
  content: string;

  @IsBoolean()
  passed: boolean;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  weight?: number;
}

export class MineFailuresDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  batchId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => MinedCaseDto)
  cases: MinedCaseDto[];

  @IsInt()
  @Min(1)
  @Max(500)
  maxMined: number;
}

// ============================================================================
// AI-033..035: model registry, auto-generated cards, staged promotion
// ============================================================================

export class RegisterModelLineageDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  datasetId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  evalSuiteId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  parentVersionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  runFingerprint?: string;
}

export class RegisterModelDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  modelId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  owners: string[];

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  weightsFingerprint: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => RegisterModelLineageDto)
  lineage?: RegisterModelLineageDto;

  /** Omit for the next auto version; an explicit version must be exact-next. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  version?: number;
}

export class CardEvalScoreDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  suiteId: string;

  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  @Max(1)
  score: number;
}

export class BuildModelCardDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  modelId: string;

  @IsInt()
  @Min(1)
  version: number;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  intendedUse: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CardEvalScoreDto)
  evalScores: CardEvalScoreDto[];

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  @Max(1)
  safetyPassRate?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  limitations?: string[];
}

export class PromoteModelDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  modelId: string;

  @IsInt()
  @Min(1)
  version: number;

  @IsIn(['experimental', 'internal', 'beta', 'stable'])
  to: 'experimental' | 'internal' | 'beta' | 'stable';

  /** Safety evidence for the stable gate; missing is a named refusal. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  @Max(1)
  safetyPassRate?: number;
}

// ============================================================================
// AI-036..039: serving scale, quantization, on-device bundles, cascade routing
// ============================================================================

export class ScaleGpuDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  id: string;

  @IsInt()
  @Min(0)
  @Max(64)
  replicaSlots: number;
}

export class PlanServingScaleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  modelId: string;

  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  requestsPerSecond: number;

  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  avgLatencyMs: number;

  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  replicaConcurrency: number;

  /** Utilization headroom target; the engine defaults to 0.7 (named). */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  @Max(1)
  targetUtilization?: number;

  /** Current pool size — enables the cautious one-step scale-down law. */
  @IsOptional()
  @IsInt()
  @Min(0)
  currentReplicas?: number;

  /** Hard replica cap; a plan above it is refused by name, never trimmed. */
  @IsOptional()
  @IsInt()
  @Min(1)
  maxReplicas?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(32)
  @ValidateNested({ each: true })
  @Type(() => ScaleGpuDto)
  gpus: ScaleGpuDto[];
}

export class BuildQuantizationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  modelId: string;

  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(1)
  weightsBytes: number;

  @IsIn(['fp16', 'int8', 'int4'])
  method: 'fp16' | 'int8' | 'int4';

  /** Post-training quantization needs calibration data; the engine floors it. */
  @IsOptional()
  @IsInt()
  @Min(0)
  calibrationSamples?: number;

  /** Max acceptable quality loss; a plan beyond it is refused by name. */
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  @Max(1)
  qualityBudget: number;
}

export class BuildBundleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  modelId: string;

  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(1)
  quantizedBytes: number;

  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(1)
  deviceMemoryBytes: number;

  /** Must be a real offline runtime — no silent server round-trips. */
  @IsIn(['llama.cpp', 'coreml', 'onnxruntime', 'tflite', 'webgpu'])
  runtime: string;
}

export class RouteModelEntryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  id: string;

  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  costPer1kTokens: number;

  @IsInt()
  @Min(1)
  maxTokens: number;

  /** Omit for active; false is refused by name at the engine. */
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class RoutePromptDto {
  @IsInt()
  @Min(0)
  promptTokens: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(16)
  @ValidateNested({ each: true })
  @Type(() => RouteModelEntryDto)
  models: RouteModelEntryDto[];

  /** Hard worst-case cost cap; the chain truncates at it, never crosses it. */
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  costCap: number;

  /** Confidence below which the answer escalates up the chain. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  @Max(1)
  confidenceThreshold?: number;
}

// ============================================================================
// AI-040..044: response cache + prefix reuse, streaming cancel/resume,
// serving metrics, shadow deployment, instant rollback
// ============================================================================

export class CacheLookupDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  modelId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100_000)
  prompt: string;
}

export class CacheAdmitDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  modelId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100_000)
  prompt: string;

  @IsInt()
  @Min(1)
  promptTokens: number;

  @IsInt()
  @Min(1)
  outputTokens: number;

  /** Per-model cache capacity; the engine defaults to 128 (named). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  maxEntries?: number;

  /** Pinned entries are never evicted — an all-pinned full pool is refused. */
  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  /** Deterministic clock override for LRU ordering; defaults to now. */
  @IsOptional()
  @IsInt()
  @Min(0)
  now?: number;
}

export class StreamOpenDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  streamId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  modelId: string;
}

export class StreamChunkDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  streamId: string;

  /** Must equal chunks.length — a gap is refused by name, never stitched. */
  @IsInt()
  @Min(0)
  index: number;

  @IsString()
  @MaxLength(100_000)
  content: string;
}

export class StreamLifecycleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  streamId: string;
}

export class StreamResumeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  streamId: string;

  /** Last chunk index the client saw; -1 means it saw nothing yet. */
  @IsInt()
  @Min(-1)
  @Max(65535)
  clientLastIndex: number;
}

export class MetricSampleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  modelId: string;

  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  latencyMs: number;

  @IsInt()
  @Min(1)
  tokens: number;

  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  costUsd: number;

  /** Omit for success; false counts in the honest error rate. */
  @IsOptional()
  @IsBoolean()
  ok?: boolean;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  ttftMs?: number;
}

export class AggregateMetricsDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  modelId: string;

  /** p95 SLO budget; the engine defaults to 2000ms (named). */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  latencyBudgetMs?: number;
}

export class ShadowCreateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  championId: string;

  /** The challenger answers beside the champion and NEVER reaches users. */
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  challengerId: string;

  /** Agreement rate needed to leave the shadow; the engine defaults to 0.95. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  @Max(1)
  agreementThreshold?: number;
}

export class ShadowPairDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  championId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  challengerId: string;

  @IsBoolean()
  agree: boolean;
}

export class ShadowEvaluateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  championId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  challengerId: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  @Max(1)
  agreementThreshold?: number;
}

export class RollbackDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  modelId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  currentVersion: string;

  /** Must be a version that previously served — blind flips are refused. */
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  targetVersion: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  servedVersions: string[];
}

// --- AI-045..047: workspace model access, dedicated instances, on-prem packages ---

export class PinModelDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  workspaceId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  modelId: string;

  /** Omit to pin the latest registered version. Must exist in the registry. */
  @IsOptional()
  @IsInt()
  @Min(1)
  versionId?: number;

  /** Per-model registry tier (MT-104) — never a blanket plan tier. */
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  modelTier: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(16)
  @IsString({ each: true })
  planTiers: string[];
}

export class UnpinModelDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  workspaceId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  modelId: string;
}

export class ResolveModelDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  workspaceId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  modelId: string;

  /** Omit to fall back to the latest registered version. */
  @IsOptional()
  @IsInt()
  @Min(1)
  fallbackVersionId?: number;
}

export class ReserveInstancesDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  workspaceId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  modelId: string;

  @IsInt()
  @Min(1)
  @Max(10000)
  slots: number;

  @IsInt()
  @Min(1)
  @Max(100000)
  poolTotal: number;
}

export class ReleaseInstancesDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  workspaceId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  modelId: string;
}

export class PackageBuildDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  modelId: string;

  @IsInt()
  @Min(1)
  versionId: number;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  licenseTerms: string;

  @IsOptional()
  @IsBoolean()
  quantized?: boolean;
}

export class ReimportVerifyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  modelId: string;

  @IsInt()
  @Min(1)
  versionId: number;

  @IsBoolean()
  quantized: boolean;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  weightsFingerprint: string;

  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  @Max(1)
  qualityScore: number;

  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  @Max(1)
  qualityGate: number;

  @IsBoolean()
  licenseAccepted: boolean;
}
