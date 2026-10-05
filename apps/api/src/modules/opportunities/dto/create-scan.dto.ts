// ============================================================================
// FILE: /apps/api/src/modules/opportunities/dto/create-scan.dto.ts
// ============================================================================
// Request body for launching a multi-source opportunity scan.
// Budget and scope caps are validated here — the scanner never runs
// unbounded on the user's behalf.

import {
  IsOptional,
  IsEnum,
  IsArray,
  IsInt,
  Min,
  Max,
  IsUUID,
  IsBoolean,
  IsString,
} from 'class-validator';
import { OpportunityCategory, OpportunitySource } from '../enums';

export class CreateScanDto {
  // Attach the scan to an existing opportunity, or leave null for a
  // broad portfolio-wide discovery scan.
  @IsOptional() @IsUUID() opportunityId?: string;

  // Scope: which categories and sources to scan. Empty = all enabled sources.
  @IsOptional() @IsArray() @IsEnum(OpportunityCategory, { each: true }) categories?: OpportunityCategory[];
  @IsOptional() @IsArray() @IsEnum(OpportunitySource, { each: true }) sources?: OpportunitySource[];

  // Hard caps — zero-trust: the agent cannot exceed the user's declared budget.
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) maxSignals?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(3600) maxDurationSeconds?: number;

  @IsOptional() @IsBoolean() notifyOnComplete?: boolean;
  @IsOptional() @IsString() note?: string;
}

// Import Type for the numeric transforms above.
import { Type } from 'class-transformer';
