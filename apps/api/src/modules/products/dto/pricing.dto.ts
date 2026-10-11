// ============================================================================
// FILE: apps/api/src/modules/products/dto/pricing.dto.ts
// ============================================================================

import { IsOptional, IsString, IsNumber, IsArray, IsBoolean, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class PricingDto {
  @IsString() model: 'free'|'one-time'|'subscription'|'freemium'|'pay-what-you-want'|'donation'|'tiered';
  @IsOptional() @IsNumber() price?: number; @IsOptional() @IsNumber() salePrice?: number; @IsOptional() @IsString() currency?: string;
  @IsOptional() @ValidateNested() @Type(() => SubscriptionDto) subscription?: SubscriptionDto;
  @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => TierDto) tiers?: TierDto[];
  @IsOptional() @ValidateNested() @Type(() => CostDto) cost?: CostDto;
  @IsOptional() @IsNumber() profitMargin?: number; @IsOptional() @IsNumber() breakEvenUnits?: number;
  @IsOptional() @IsBoolean() taxIncluded?: boolean; @IsOptional() @IsNumber() taxRate?: number;
  @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => VatDto) vats?: VatDto[];
}

export class SubscriptionDto { @IsString() interval:'daily'|'weekly'|'monthly'|'quarterly'|'yearly'; @IsNumber() amount:number; @IsOptional() @IsNumber() trialDays?:number; @IsOptional() @IsNumber() setupFee?:number; }

export class TierDto { @IsString() id:string; @IsString() name:string; @IsOptional() @IsString() description?:string; @IsNumber() price:number; @IsOptional() @IsArray() @IsString({each:true}) features?:string[]; @IsOptional() @IsNumber() maxUsers?:number; @IsOptional() @IsNumber() maxUsage?:number; }

export class CostDto { @IsOptional() @IsNumber() production?:number; @IsOptional() @IsNumber() distribution?:number; @IsOptional() @IsNumber() marketing?:number; @IsOptional() @IsNumber() total?:number; }

export class VatDto { @IsString() country:string; @IsNumber() rate:number; }

export class PaymentOptionDto { @IsString() type:string; @IsOptional() @IsString() provider?:string; @IsOptional() @IsBoolean() enabled?:boolean; @IsOptional() @IsNumber() fee?:number; }
