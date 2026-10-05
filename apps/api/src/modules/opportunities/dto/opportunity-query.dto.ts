// ============================================================================
// FILE: /apps/api/src/modules/opportunities/dto/opportunity-query.dto.ts
// ============================================================================
// Query/filter DTO for listing opportunities. Matches the fields the service
// already filters on (category, source, status, priority, riskLevel, search).

import { IsOptional, IsEnum, IsString, IsInt, Min, Max, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import {
  OpportunityCategory,
  OpportunitySource,
  OpportunityStatus,
  OpportunityPriority,
  RiskLevel,
} from '../enums';

export class OpportunityQueryDto {
  @IsOptional() @IsEnum(OpportunityCategory) category?: OpportunityCategory;
  @IsOptional() @IsEnum(OpportunitySource) source?: OpportunitySource;
  @IsOptional() @IsEnum(OpportunityStatus) status?: OpportunityStatus;
  @IsOptional() @IsEnum(OpportunityPriority) priority?: OpportunityPriority;
  @IsOptional() @IsEnum(RiskLevel) riskLevel?: RiskLevel;

  @IsOptional() @IsString() search?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;

  @IsOptional() @IsBoolean() includeKilled?: boolean;
  @IsOptional() @IsBoolean() includeArchived?: boolean;
}
