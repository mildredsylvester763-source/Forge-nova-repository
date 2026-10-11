// ============================================================================
// FILE: apps/api/src/modules/products/dto/create-product.dto.ts
// ============================================================================

import { IsOptional, IsString, IsEnum, IsArray, IsBoolean, ValidateNested, IsJSON } from 'class-validator';
import { Type } from 'class-transformer';
import { ProductType, ProductFormat, ProductStatus } from '../enums';
import { SpecificationDto } from './specification.dto';
import { ContentDto } from './content.dto';
import { DesignDto, LogoDto, BrandingDto } from './design.dto';
import { PricingDto } from './pricing.dto';
import { DeliveryDto, ShippingDto, FulfillmentDto, ServiceDeliveryDto, ApiDeliveryDto, DistributionChannelDto } from './delivery.dto';
import { MarketingDto } from './marketing.dto';
import { SalesDto } from './sales.dto';
import { LegalDto } from './legal.dto';
import { VersionDto, TeamMemberDto } from './versions-team.dto';
import { AnalyticsDto } from './analytics.dto';
import { AutomationDto, ProductGenerationDto, ContentGenerationDto, MarketingAutomationDto, CustomerSupportDto } from './automation.dto';
import { TestingDto, QualityDto, TestingComplianceDto } from './quality-testing.dto';
import { DocumentationDto, FaqDto, TutorialDto, ChangelogDto, SupportDto, TimelineDto } from './documentation-support.dto';

export class CreateProductDto {
  @IsString() name:string;
  @IsOptional() @IsString() description?:string;
  @IsOptional() @IsString() shortDescription?:string;
  @IsOptional() @IsString() slug?:string;
  @IsEnum(ProductType) type:ProductType;
  @IsOptional() @IsEnum(ProductFormat) format?:ProductFormat;
  @IsOptional() @IsArray() @IsEnum(ProductFormat,{each:true}) formats?:ProductFormat[];
  @IsOptional() @IsArray() @IsString({each:true}) tags?:string[];
  @IsOptional() @IsArray() @IsString({each:true}) categories?:string[];
  @IsOptional() @IsEnum(ProductStatus) status?:ProductStatus;
  @IsOptional() @ValidateNested() @Type(() => SpecificationDto) specification?:SpecificationDto;
  @IsOptional() @ValidateNested() @Type(() => ContentDto) content?:ContentDto;
  @IsOptional() @ValidateNested() @Type(() => DesignDto) design?:DesignDto;
  @IsOptional() @ValidateNested() @Type(() => LogoDto) logo?:LogoDto;
  @IsOptional() @ValidateNested() @Type(() => BrandingDto) branding?:BrandingDto;
  @IsOptional() @ValidateNested() @Type(() => PricingDto) pricing?:PricingDto;
  @IsOptional() @ValidateNested() @Type(() => DeliveryDto) delivery?:DeliveryDto;
  @IsOptional() @ValidateNested() @Type(() => ShippingDto) shipping?:ShippingDto;
  @IsOptional() @ValidateNested() @Type(() => FulfillmentDto) fulfillment?:FulfillmentDto;
  @IsOptional() @ValidateNested() @Type(() => ServiceDeliveryDto) serviceDelivery?:ServiceDeliveryDto;
  @IsOptional() @ValidateNested() @Type(() => ApiDeliveryDto) apiDelivery?:ApiDeliveryDto;
  @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => DistributionChannelDto) distributionChannels?:DistributionChannelDto[];
  @IsOptional() @ValidateNested() @Type(() => MarketingDto) marketing?:MarketingDto;
  @IsOptional() @ValidateNested() @Type(() => SalesDto) sales?:SalesDto;
  @IsOptional() @ValidateNested() @Type(() => LegalDto) legal?:LegalDto;
  @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => VersionDto) versions?:VersionDto[];
  @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => TeamMemberDto) team?:TeamMemberDto[];
  @IsOptional() @ValidateNested() @Type(() => AnalyticsDto) analytics?:AnalyticsDto;
  @IsOptional() @ValidateNested() @Type(() => AutomationDto) automation?:AutomationDto;
  @IsOptional() @ValidateNested() @Type(() => ProductGenerationDto) productGeneration?:ProductGenerationDto;
  @IsOptional() @ValidateNested() @Type(() => ContentGenerationDto) contentGeneration?:ContentGenerationDto;
  @IsOptional() @ValidateNested() @Type(() => MarketingAutomationDto) marketingAutomation?:MarketingAutomationDto;
  @IsOptional() @ValidateNested() @Type(() => CustomerSupportDto) customerSupport?:CustomerSupportDto;
  @IsOptional() @ValidateNested() @Type(() => TestingDto) testing?:TestingDto;
  @IsOptional() @ValidateNested() @Type(() => QualityDto) quality?:QualityDto;
  @IsOptional() @ValidateNested() @Type(() => TestingComplianceDto) testingCompliance?:TestingComplianceDto;
  @IsOptional() @ValidateNested() @Type(() => DocumentationDto) documentation?:DocumentationDto;
  @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => FaqDto) faqs?:FaqDto[];
  @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => TutorialDto) tutorials?:TutorialDto[];
  @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => ChangelogDto) changelog?:ChangelogDto[];
  @IsOptional() @ValidateNested() @Type(() => SupportDto) support?:SupportDto;
  @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => TimelineDto) timeline?:TimelineDto[];
  @IsOptional() @IsJSON() workflow?:{currentStep?:string; totalSteps?:number; completedSteps?:number; progress?:number; blocked?:boolean; blockingReason?:string};
  @IsOptional() @IsBoolean() aiGenerated?:boolean;
  @IsOptional() @IsJSON() aiGeneration?:{modelUsed?:string; prompt?:string; generationDate?:string; confidence?:number; iterations?:number; temperature?:number; topP?:number; maxTokens?:number; generationTime?:number; cost?:number};
  @IsOptional() @IsJSON() aiOptimization?:{optimizedForSEO?:boolean; optimizedForConversion?:boolean; optimizedForAccessibility?:boolean; optimizationScore?:number; suggestions?:string[]};
  @IsOptional() @IsBoolean() isPublic?:boolean;
  @IsOptional() @IsBoolean() isFeatured?:boolean;
  @IsOptional() @IsBoolean() isArchived?:boolean;
}

// Legacy re-exports: these were exported from this path before the split.
export { EmailDto } from './marketing.dto';
export { ComplianceStandardDto } from './quality-testing.dto';
