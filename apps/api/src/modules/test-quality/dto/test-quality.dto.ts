// DTOs for the test-quality module (FORGE TQ-036..040). Wire shapes only:
// the pure engines accept unknown-shaped input and validate everything
// themselves with named refusals, so these classes exist for the global
// validation pipe, not for engine logic. The pipe whitelists and forbids
// unknown properties, so every field carries a decorator; bulk payloads
// the engines own (mutants, combos, golden values) stay unknown-shaped
// and are validated by the engines with named reasons.

import { Type } from 'class-transformer';
import {
  Allow,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class MutationSourceDto {
  @IsArray()
  @IsString({ each: true })
  source: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  operators?: string[];
}

export class MutationReportDto {
  @IsArray()
  mutants: unknown[];

  @IsObject()
  results: Record<string, string>;

  @IsOptional()
  @IsInt()
  threshold?: number;
}

export class PactRequestDto {
  @IsString()
  @IsNotEmpty()
  method: string;

  @IsString()
  @IsNotEmpty()
  path: string;
}

export class PactResponseDto {
  @IsInt()
  status: number;

  @IsOptional()
  @IsObject()
  body?: Record<string, unknown>;
}

export class PactInteractionDto {
  @IsString()
  @IsNotEmpty()
  description: string;

  @ValidateNested()
  @Type(() => PactRequestDto)
  request: PactRequestDto;

  @ValidateNested()
  @Type(() => PactResponseDto)
  response: PactResponseDto;
}

export class PactBuildDto {
  @IsString()
  @IsNotEmpty()
  consumer: string;

  @IsString()
  @IsNotEmpty()
  provider: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PactInteractionDto)
  interactions: PactInteractionDto[];
}

export class ProviderResponseDto {
  @IsString()
  @IsNotEmpty()
  method: string;

  @IsString()
  @IsNotEmpty()
  path: string;

  @IsInt()
  status: number;

  @IsOptional()
  @IsObject()
  body?: Record<string, unknown>;
}

export class ContractVerifyDto {
  @IsString()
  @IsNotEmpty()
  consumer: string;

  @IsString()
  @IsNotEmpty()
  provider: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PactInteractionDto)
  interactions: PactInteractionDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProviderResponseDto)
  providerResponses: ProviderResponseDto[];
}

export class GoldenWriteDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @Allow()
  value: unknown;
}

export class GoldenVerifyDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @Allow()
  value: unknown;
}

export class GoldenUpdateDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @Allow()
  value: unknown;
}

export class VisualImageDto {
  @IsInt()
  width: number;

  @IsInt()
  height: number;

  @IsArray()
  @IsString({ each: true })
  pixels: string[];
}

export class VisualRegionDto {
  @IsInt()
  x: number;

  @IsInt()
  y: number;

  @IsInt()
  width: number;

  @IsInt()
  height: number;
}

export class VisualDiffDto {
  @ValidateNested()
  @Type(() => VisualImageDto)
  baseline: VisualImageDto;

  @ValidateNested()
  @Type(() => VisualImageDto)
  candidate: VisualImageDto;

  @IsOptional()
  @IsNumber()
  threshold?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VisualRegionDto)
  ignoreRegions?: VisualRegionDto[];
}

export class MatrixPlanDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  browsers?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  platforms?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  viewports?: string[];
}

export class MatrixScoreDto {
  @IsArray()
  combos: unknown[];

  @IsObject()
  results: Record<string, string>;

  @IsOptional()
  @IsInt()
  threshold?: number;
}
