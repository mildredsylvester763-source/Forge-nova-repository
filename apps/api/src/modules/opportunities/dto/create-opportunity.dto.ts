// ============================================================================
// FILE: /apps/api/src/modules/opportunities/dto/create-opportunity.dto.ts
// ============================================================================
// The root create DTO. Every nested family lives in its own single-concern
// file; this class composes them.

import { IsOptional, IsString, IsNumber, IsEnum, IsArray, IsBoolean, IsUrl, IsDateString, ValidateNested, IsUUID, IsJSON } from 'class-validator';
import { Type } from 'class-transformer';
import { OpportunityCategory, OpportunitySource, OpportunityPriority, OpportunityStatus, RiskLevel } from '../enums';
import { TargetAudienceDto } from './audience.dto';
import { CompetitorDto, TrendDataDto } from './market-research.dto';
import { FinancialProjectionsDto } from './financials.dto';
import { RequiredResourcesDto, FulfillmentOptionDto, DistributionChannelDto } from './resources-fulfillment.dto';
import { RiskDto, RegulatoryRequirementDto, RecommendedActionDto } from './risk-actions.dto';
import { DecisionDto, RelatedOpportunityDto, SupportingDataDto, AiAnalysisDto, AutomationPotentialDto } from './ai-analysis.dto';
import { NotificationDto, AlertDto, UserNoteDto, TimelineEventDto, PortfolioMetricsDto, PerformanceMetricsDto, LessonLearnedDto, ImprovementSuggestionDto } from './tracking.dto';

export class CreateOpportunityDto {
  // Basic Information
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  summary?: string;

  // Category & Classification
  @IsEnum(OpportunityCategory)
  category: OpportunityCategory;

  @IsEnum(OpportunitySource)
  source: OpportunitySource;

  @IsOptional()
  @IsString()
  externalId?: string;

  @IsOptional()
  @IsUrl()
  externalUrl?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keywords?: string[];

  // Status & Priority
  @IsOptional()
  @IsEnum(OpportunityStatus)
  status?: OpportunityStatus;

  @IsOptional()
  @IsEnum(OpportunityPriority)
  priority?: OpportunityPriority;

  // Scores
  @IsOptional()
  @IsNumber()
  score?: number;

  @IsOptional()
  @IsNumber()
  demandScore?: number;

  @IsOptional()
  @IsNumber()
  competitionScore?: number;

  @IsOptional()
  @IsNumber()
  profitabilityScore?: number;

  @IsOptional()
  @IsNumber()
  feasibilityScore?: number;

  @IsOptional()
  @IsNumber()
  trendScore?: number;

  @IsOptional()
  @IsNumber()
  seasonalityScore?: number;

  @IsOptional()
  @IsEnum(RiskLevel)
  riskLevel?: RiskLevel;

  @IsOptional()
  @IsNumber()
  riskScore?: number;

  // Market Data
  @IsOptional()
  @IsNumber()
  estimatedMarketSize?: number;

  @IsOptional()
  @IsNumber()
  estimatedMonthlySearches?: number;

  @IsOptional()
  @IsNumber()
  estimatedRevenue?: number;

  @IsOptional()
  @IsNumber()
  estimatedProfitMargin?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => TargetAudienceDto)
  targetAudience?: TargetAudienceDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CompetitorDto)
  competitors?: CompetitorDto[];

  // Trend Data
  @IsOptional()
  @ValidateNested()
  @Type(() => TrendDataDto)
  trendData?: TrendDataDto;

  // Financial Projections
  @IsOptional()
  @ValidateNested()
  @Type(() => FinancialProjectionsDto)
  financialProjections?: FinancialProjectionsDto;

  // Operational Data
  @IsOptional()
  @ValidateNested()
  @Type(() => RequiredResourcesDto)
  requiredResources?: RequiredResourcesDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FulfillmentOptionDto)
  fulfillmentOptions?: FulfillmentOptionDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DistributionChannelDto)
  distributionChannels?: DistributionChannelDto[];

  // Risk Assessment
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RiskDto)
  risks?: RiskDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RegulatoryRequirementDto)
  regulatoryRequirements?: RegulatoryRequirementDto[];

  // Actions & Decisions
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecommendedActionDto)
  recommendedActions?: RecommendedActionDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DecisionDto)
  decisions?: DecisionDto[];

  // Associated Data
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RelatedOpportunityDto)
  relatedOpportunities?: RelatedOpportunityDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SupportingDataDto)
  supportingData?: SupportingDataDto[];

  // Portfolio Integration
  @IsOptional()
  @IsUUID()
  portfolioId?: string;

  @IsOptional()
  @IsUUID()
  businessId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PortfolioMetricsDto)
  portfolioMetrics?: PortfolioMetricsDto;

  // Learning & Improvement
  @IsOptional()
  @ValidateNested()
  @Type(() => PerformanceMetricsDto)
  performanceMetrics?: PerformanceMetricsDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LessonLearnedDto)
  lessonsLearned?: LessonLearnedDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImprovementSuggestionDto)
  improvementSuggestions?: ImprovementSuggestionDto[];

  // AI & Automation
  @IsOptional()
  @ValidateNested()
  @Type(() => AiAnalysisDto)
  aiAnalysis?: AiAnalysisDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => AutomationPotentialDto)
  automationPotential?: AutomationPotentialDto;

  // Notifications & Alerts
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NotificationDto)
  notifications?: NotificationDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AlertDto)
  alerts?: AlertDto[];

  // User Preferences
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UserNoteDto)
  userNotes?: UserNoteDto[];

  @IsOptional()
  @IsJSON()
  customFields?: Record<string, any>;

  @IsOptional()
  @IsBoolean()
  isFavorite?: boolean;

  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;

  @IsOptional()
  @IsBoolean()
  isHidden?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  watchers?: string[];

  // Timeline
  @IsOptional()
  @IsDateString()
  discoveredAt?: string;

  @IsOptional()
  @IsDateString()
  validatedAt?: string;

  @IsOptional()
  @IsDateString()
  approvedAt?: string;

  @IsOptional()
  @IsDateString()
  launchedAt?: string;

  @IsOptional()
  @IsDateString()
  firstRevenueAt?: string;

  @IsOptional()
  @IsDateString()
  profitableAt?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TimelineEventDto)
  timeline?: TimelineEventDto[];
}
