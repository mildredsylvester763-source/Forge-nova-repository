// ============================================================================
// FILE: /apps/api/src/modules/ai-training/dto/ai-training.dto.ts
// ============================================================================

import {
  IsString, IsEnum, IsBoolean, IsInt, IsOptional, IsArray,
  MaxLength, MinLength, Min, Max, ArrayMaxSize,
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
