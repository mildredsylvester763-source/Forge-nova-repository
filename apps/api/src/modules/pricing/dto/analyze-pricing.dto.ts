// ============================================================================
// FILE: /apps/api/src/modules/pricing/dto/analyze-pricing.dto.ts
// ============================================================================

import { IsArray, IsNumber, IsOptional, IsPositive, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PriceObservation } from '../engine/price-elasticity';

export class PriceObservationDto implements PriceObservation {
  @IsPositive()
  beforePrice: number;

  @IsPositive()
  afterPrice: number;

  @IsNumber()
  unitsBefore: number;

  @IsNumber()
  unitsAfter: number;
}

export class AnalyzePricingDto {
  // Observations may come from the request or from the product's stored
  // metadata.pricingObservations; the request wins when both exist.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PriceObservationDto)
  observations?: PriceObservationDto[];

  @IsOptional()
  @IsPositive()
  currentPrice?: number;

  @IsOptional()
  @IsNumber()
  unitsPerPeriod?: number;

  @IsOptional()
  @IsNumber()
  costPerUnit?: number;
}
