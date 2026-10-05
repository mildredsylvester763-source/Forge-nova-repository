// ============================================================================
// FILE: /apps/api/src/modules/opportunities/dto/opportunity-query.dto.ts
// ============================================================================
// List/filter parameters. Carries BOTH the single-value filters findAll()
// reads and the array/range filters applyFilters() reads — so the service
// can be served by one DTO regardless of which filter path it takes.

import { IsOptional, IsEnum, IsString, IsInt, IsArray, IsNumber, IsDateString, Min, Max, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import {
  OpportunityCategory,
  OpportunitySource,
  OpportunityStatus,
  OpportunityPriority,
  RiskLevel,
} from '../enums';

export class OpportunityQueryDto {
  // Single-value filters (findAll)
  @IsOptional() @IsEnum(OpportunityCategory) category?: OpportunityCategory;
  @IsOptional() @IsEnum(OpportunitySource) source?: OpportunitySource;
  @IsOptional() @IsEnum(OpportunityStatus) status?: OpportunityStatus;
  @IsOptional() @IsEnum(OpportunityPriority) priority?: OpportunityPriority;
  @IsOptional() @IsEnum(RiskLevel) riskLevel?: RiskLevel;

  // Array filters (applyFilters)
  @IsOptional() @IsArray() @IsEnum(OpportunityCategory, { each: true }) categories?: OpportunityCategory[];
  @IsOptional() @IsArray() @IsEnum(OpportunitySource, { each: true }) sources?: OpportunitySource[];
  @IsOptional() @IsArray() @IsEnum(OpportunityStatus, { each: true }) statuses?: OpportunityStatus[];
  @IsOptional() @IsArray() @IsEnum(OpportunityPriority, { each: true }) priorities?: OpportunityPriority[];
  @IsOptional() @IsArray() @IsEnum(RiskLevel, { each: true }) riskLevels?: RiskLevel[];

  // Free-text
  @IsOptional() @IsString() search?: string;

  // Score ranges (applyFilters)
  @IsOptional() @Type(() => Number) @IsNumber() minScore?: number;
  @IsOptional() @Type(() => Number) @IsNumber() maxScore?: number;
  @IsOptional() @Type(() => Number) @IsNumber() minDemandScore?: number;
  @IsOptional() @Type(() => Number) @IsNumber() maxCompetitionScore?: number;

  // Date windows (applyFilters)
  @IsOptional() @IsDateString() discoveredBefore?: string;
  @IsOptional() @IsDateString() createdAfter?: string;
  @IsOptional() @IsDateString() createdBefore?: string;
  @IsOptional() @IsDateString() updatedAfter?: string;

  // Pagination (findAll: skip/take)
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) skip?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) take?: number;

  @IsOptional() @IsBoolean() includeKilled?: boolean;
  @IsOptional() @IsBoolean() includeArchived?: boolean;
}
