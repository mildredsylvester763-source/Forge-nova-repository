// ============================================================================
// FILE: /apps/api/src/modules/opportunities/dto/create-scan.dto.ts
// ============================================================================
// Request body for launching a scan. Matches what createScan() reads:
// runImmediately, scheduledAt, source/sources, parameters, notifications.
// Caps are validated here — the scanner never runs unbounded on the user's
// behalf (zero-trust: agent budget is declared, not assumed).

import { MaxLength,
  IsOptional,
  IsEnum,
  IsArray,
  IsInt,
  Min,
  Max,
  IsUUID,
  IsBoolean,
  IsString,
  IsObject,
  IsDateString,
} from 'class-validator';
import { OpportunityCategory, OpportunitySource } from '../enums';

export class CreateScanDto {
  @IsOptional() @IsString() @MaxLength(255) name?: string;

  // Attach to an existing opportunity, or null for a portfolio-wide scan.
  @IsOptional() @IsUUID() opportunityId?: string;

  // Single-source scan, or a multi-source batch.
  @IsOptional() @IsEnum(OpportunitySource) source?: OpportunitySource;
  @IsOptional() @IsArray() @IsEnum(OpportunitySource, { each: true }) sources?: OpportunitySource[];

  @IsOptional() @IsArray() @IsEnum(OpportunityCategory, { each: true }) categories?: OpportunityCategory[];

  // Scanner input: query terms, subreddits, languages, recurrence rule.
  @IsOptional() @IsObject() parameters?: Record<string, any>;

  // Hard caps — the agent cannot exceed the user's declared budget.
  @IsOptional() @IsInt() @Min(1) @Max(50) maxSignals?: number;
  @IsOptional() @IsInt() @Min(1) @Max(3600) maxDurationSeconds?: number;

  // Execution control.
  @IsOptional() @IsBoolean() runImmediately?: boolean;
  @IsOptional() @IsDateString() scheduledAt?: string;

  // Notification preferences: { onCompletion, onFailure, channels }.
  @IsOptional() @IsObject() notifications?: Record<string, any>;
}
