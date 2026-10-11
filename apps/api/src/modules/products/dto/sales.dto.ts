// ============================================================================
// FILE: apps/api/src/modules/products/dto/sales.dto.ts
// ============================================================================

import { IsOptional, IsString, IsNumber, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AffiliateDto } from './marketing.dto';

export class SalesMetricsDto { @IsOptional() @IsNumber() revenue?:number; @IsOptional() @IsNumber() orders?:number; @IsOptional() @IsNumber() averageOrderValue?:number; @IsOptional() @IsNumber() growth?:number; }

export class FunnelDto { @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => FunnelStepDto) steps?:FunnelStepDto[]; }

export class FunnelStepDto { @IsString() step:string; @IsNumber() users:number; @IsNumber() conversionRate:number; }

export class SalesDto { @IsOptional() @ValidateNested() @Type(() => FunnelDto) funnel?:FunnelDto; @IsOptional() @ValidateNested() @Type(() => SalesMetricsDto) metrics?:SalesMetricsDto; @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => AffiliateDto) affiliates?:AffiliateDto[]; }
