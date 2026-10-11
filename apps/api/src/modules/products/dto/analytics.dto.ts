// ============================================================================
// FILE: apps/api/src/modules/products/dto/analytics.dto.ts
// ============================================================================

import { IsOptional, IsString, IsNumber, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { FunnelStepDto } from './sales.dto';

export class AnalyticsDto { @IsOptional() @ValidateNested() @Type(() => UsageDto) usage?:UsageDto; @IsOptional() @ValidateNested() @Type(() => EngagementAnalyticsDto) engagement?:EngagementAnalyticsDto; @IsOptional() @ValidateNested() @Type(() => ConversionDto) conversion?:ConversionDto; @IsOptional() @ValidateNested() @Type(() => RevenueAnalyticsDto) revenue?:RevenueAnalyticsDto; @IsOptional() @ValidateNested() @Type(() => RetentionDto) retention?:RetentionDto; @IsOptional() @ValidateNested() @Type(() => TechnicalDto) technical?:TechnicalDto; @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => InsightDto) insights?:InsightDto[]; }

export class UsageDto { @IsOptional() @IsNumber() totalUsers?:number; @IsOptional() @IsNumber() activeUsers?:number; @IsOptional() @IsNumber() sessions?:number; @IsOptional() @IsNumber() sessionDuration?:number; @IsOptional() @IsNumber() pageViews?:number; @IsOptional() @IsNumber() uniqueVisitors?:number; }

export class EngagementAnalyticsDto { @IsOptional() @IsNumber() likes?:number; @IsOptional() @IsNumber() shares?:number; @IsOptional() @IsNumber() comments?:number; @IsOptional() @IsNumber() ratings?:number; @IsOptional() @IsNumber() averageRating?:number; @IsOptional() @IsNumber() reviews?:number; @IsOptional() @IsNumber() favorites?:number; }

export class ConversionDto { @IsOptional() @IsNumber() visitors?:number; @IsOptional() @IsNumber() leads?:number; @IsOptional() @IsNumber() trials?:number; @IsOptional() @IsNumber() customers?:number; @IsOptional() @IsNumber() conversionRate?:number; @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => FunnelStepDto) funnel?:FunnelStepDto[]; }

export class RevenueAnalyticsDto { @IsOptional() @IsNumber() revenue?:number; @IsOptional() @IsNumber() recurringRevenue?:number; @IsOptional() @IsNumber() averageRevenuePerUser?:number; @IsOptional() @IsNumber() growth?:number; }

export class RetentionDto { @IsOptional() @IsNumber() retentionRate?:number; @IsOptional() @IsNumber() churnRate?:number; @IsOptional() @IsNumber() returningUsers?:number; }

export class TechnicalDto { @IsOptional() @IsNumber() uptime?:number; @IsOptional() @IsNumber() errorRate?:number; @IsOptional() @IsNumber() responseTime?:number; }

export class InsightDto { @IsString() id:string; @IsString() title:string; @IsOptional() @IsString() description?:string; @IsOptional() @IsString() severity?:'info'|'low'|'medium'|'high'|'critical'; @IsOptional() @IsString() recommendation?:string; }
