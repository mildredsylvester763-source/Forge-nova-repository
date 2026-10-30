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
