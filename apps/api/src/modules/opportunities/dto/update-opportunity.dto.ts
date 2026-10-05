// ============================================================================
// FILE: /apps/api/src/modules/opportunities/dto/update-opportunity.dto.ts
// ============================================================================
// Partial update DTO. Mirrors CreateOpportunityDto but every field optional.
// Ownership and id are enforced at controller/service layer, never trusted
// from the body.

import {
  IsOptional,
  IsString,
  IsNumber,
  IsEnum,
  IsArray,
  IsBoolean,
  IsUrl,
  IsDateString,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  OpportunityCategory,
  OpportunitySource,
  OpportunityPriority,
  OpportunityStatus,
  RiskLevel,
} from '../enums';

export class UpdateOpportunityDto {
  @IsOptional() @IsString() @IsString({ length: 255 }) title?: string;
  @IsOptional() @IsString() description?: string;

  @IsOptional() @IsEnum(OpportunityCategory) category?: OpportunityCategory;
  @IsOptional() @IsEnum(OpportunitySource) source?: OpportunitySource;
  @IsOptional() @IsEnum(OpportunityStatus) status?: OpportunityStatus;
  @IsOptional() @IsEnum(OpportunityPriority) priority?: OpportunityPriority;
  @IsOptional() @IsEnum(RiskLevel) riskLevel?: RiskLevel;

  @IsOptional() @IsNumber() score?: number;
  @IsOptional() @IsNumber() confidence?: number;
  @IsOptional() @IsNumber() estimatedMarketSize?: number;
  @IsOptional() @IsNumber() estimatedMonthlyRevenue?: number;
  @IsOptional() @IsNumber() competitionIntensity?: number;
  @IsOptional() @IsNumber() priceElasticity?: number;

  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsDateString() lastScannedAt?: string;
  @IsOptional() @IsDateString() nextScanAt?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
