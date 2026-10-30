// ============================================================================
// FILE: /apps/api/src/modules/ai-training/dto/ai-training.dto.ts
// ============================================================================

import {
  IsString, IsEnum, IsBoolean, IsInt, IsOptional, IsArray,
  MaxLength, MinLength, Min, Max, ArrayMaxSize, IsUUID, IsNumber, IsIn, IsObject,
} from 'class-validator';
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
