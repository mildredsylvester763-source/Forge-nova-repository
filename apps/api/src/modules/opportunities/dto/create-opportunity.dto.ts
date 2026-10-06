// ============================================================================
// FILE: /apps/api/src/modules/opportunities/dto/create-opportunity.dto.ts
// ============================================================================

import {
  IsOptional,
  IsString,
  IsNumber,
  IsEnum,
  IsArray,
  IsBoolean,
  IsUrl,
  IsDateString,
  ValidateNested,
  IsUUID,
  IsJson,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  OpportunityCategory,
  OpportunitySource,
  OpportunityPriority,
  OpportunityStatus,
  RiskLevel,
} from '../enums';

// DTO 1: TargetAudienceDto
class TargetAudienceDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => DemographicsDto)
  demographics?: DemographicsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => PsychographicsDto)
  psychographics?: PsychographicsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => GeographicsDto)
  geographics?: GeographicsDto;
}

// DTO 2: DemographicsDto
class DemographicsDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ageRange?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  gender?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  incomeLevel?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  education?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  location?: string[];
}

// DTO 3: PsychographicsDto
class PsychographicsDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  interests?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  values?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  lifestyle?: string[];
}

// DTO 4: GeographicsDto
class GeographicsDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  countries?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  regions?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  cities?: string[];
}

// DTO 5: CompetitorDto
class CompetitorDto {
  @IsString()
  id: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsUrl()
  url?: string;

  @IsOptional()
  @IsNumber()
  marketShare?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  strengths?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  weaknesses?: string[];

  @IsOptional()
  @IsString()
  pricing?: string;

  @IsOptional()
  @IsNumber()
  rating?: number;
}

// DTO 6: TrendDataDto
class TrendDataDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => GoogleTrendsDto)
  googleTrends?: GoogleTrendsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => SocialMediaDto)
  socialMedia?: SocialMediaDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => SeasonalityDto)
  seasonality?: SeasonalityDto;
}

// DTO 7: GoogleTrendsDto
class GoogleTrendsDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InterestOverTimeDto)
  interestOverTime?: InterestOverTimeDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RegionalInterestDto)
  regionalInterest?: RegionalInterestDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RelatedQueryDto)
  relatedQueries?: RelatedQueryDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RelatedTopicDto)
  relatedTopics?: RelatedTopicDto[];
}

// DTO 8: InterestOverTimeDto
class InterestOverTimeDto {
  @IsString()
  date: string;

  @IsNumber()
  value: number;
}

// DTO 9: RegionalInterestDto
class RegionalInterestDto {
  @IsString()
  region: string;

  @IsNumber()
  value: number;
}

// DTO 10: RelatedQueryDto
class RelatedQueryDto {
  @IsString()
  query: string;

  @IsNumber()
  value: number;
}

// DTO 11: RelatedTopicDto
class RelatedTopicDto {
  @IsString()
  topic: string;

  @IsNumber()
  value: number;
}

// DTO 12: SocialMediaDto
class SocialMediaDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => TwitterDto)
  twitter?: TwitterDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => RedditDto)
  reddit?: RedditDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => InstagramDto)
  instagram?: InstagramDto;
}

// DTO 13: TwitterDto
class TwitterDto {
  @IsOptional()
  @IsNumber()
  mentions?: number;

  @IsOptional()
  @IsNumber()
  sentiment?: number;

  @IsOptional()
  @IsNumber()
  growthRate?: number;
}

// DTO 14: RedditDto
class RedditDto {
  @IsOptional()
  @IsNumber()
  posts?: number;

  @IsOptional()
  @IsNumber()
  comments?: number;

  @IsOptional()
  @IsNumber()
  upvotes?: number;

  @IsOptional()
  @IsNumber()
  growthRate?: number;
}

// DTO 15: InstagramDto
class InstagramDto {
  @IsOptional()
  @IsNumber()
  posts?: number;

  @IsOptional()
  @IsNumber()
  engagement?: number;

  @IsOptional()
  @IsNumber()
  growthRate?: number;
}

// DTO 16: SeasonalityDto
class SeasonalityDto {
  @IsOptional()
  @IsBoolean()
  isSeasonal?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  peakMonths?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  troughMonths?: string[];

  @IsOptional()
  @IsNumber()
  seasonalityStrength?: number;
}

// DTO 17: FinancialProjectionsDto
class FinancialProjectionsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => RevenueDto)
  revenue?: RevenueDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CostsDto)
  costs?: CostsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ProfitDto)
  profit?: ProfitDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => BreakEvenDto)
  breakEven?: BreakEvenDto;

  @IsOptional()
  @IsNumber()
  roi?: number;
}

// DTO 18: RevenueDto
class RevenueDto {
  @IsOptional()
  @IsNumber()
  year1?: number;

  @IsOptional()
  @IsNumber()
  year2?: number;

  @IsOptional()
  @IsNumber()
  year3?: number;

  @IsOptional()
  @IsNumber()
  growthRate?: number;
}

// DTO 19: CostsDto
class CostsDto {
  @IsOptional()
  @IsNumber()
  startup?: number;

  @IsOptional()
  @IsNumber()
  monthly?: number;

  @IsOptional()
  @IsNumber()
  variablePerUnit?: number;
}

// DTO 20: ProfitDto
class ProfitDto {
  @IsOptional()
  @IsNumber()
  year1?: number;

  @IsOptional()
  @IsNumber()
  year2?: number;

  @IsOptional()
  @IsNumber()
  year3?: number;

  @IsOptional()
  @IsNumber()
  margin?: number;
}

// DTO 21: BreakEvenDto
class BreakEvenDto {
  @IsOptional()
  @IsNumber()
  units?: number;

  @IsOptional()
  @IsNumber()
  months?: number;
}

// DTO 22: RequiredResourcesDto
class RequiredResourcesDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => TimeDto)
  time?: TimeDto;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tools?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => BudgetDto)
  budget?: BudgetDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => TeamDto)
  team?: TeamDto;
}

// DTO 23: TimeDto
class TimeDto {
  @IsOptional()
  @IsNumber()
  setup?: number;

  @IsOptional()
  @IsNumber()
  weekly?: number;

  @IsOptional()
  @IsNumber()
  ongoing?: number;
}

// DTO 24: BudgetDto
class BudgetDto {
  @IsOptional()
  @IsNumber()
  initial?: number;

  @IsOptional()
  @IsNumber()
  monthly?: number;

  @IsOptional()
  @IsNumber()
  total?: number;
}

// DTO 25: TeamDto
class TeamDto {
  @IsOptional()
  @IsNumber()
  size?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roles?: string[];
}

// DTO 26: FulfillmentOptionDto
class FulfillmentOptionDto {
  @IsString()
  id: string;

  @IsString()
  type: 'digital' | 'physical' | 'service' | 'hybrid';

  @IsString()
  method: string;

  @IsOptional()
  @IsNumber()
  cost?: number;

  @IsOptional()
  @IsNumber()
  time?: number;

  @IsOptional()
  @IsString()
  description?: string;
}

// DTO 27: DistributionChannelDto
class DistributionChannelDto {
  @IsString()
  id: string;

  @IsString()
  type:
    | 'own-website'
    | 'marketplace'
    | 'social-media'
    | 'email'
    | 'affiliate'
    | 'wholesale'
    | 'retail';

  @IsString()
  name: string;

  @IsOptional()
  @IsUrl()
  url?: string;

  @IsOptional()
  @IsNumber()
  reach?: number;

  @IsOptional()
  @IsNumber()
  cost?: number;

  @IsOptional()
  @IsNumber()
  commission?: number;

  @IsOptional()
  @IsNumber()
  suitability?: number;
}

// DTO 28: RiskDto
class RiskDto {
  @IsString()
  id: string;

  @IsString()
  type:
    | 'market'
    | 'competition'
    | 'regulatory'
    | 'technical'
    | 'financial'
    | 'operational'
    | 'reputational';

  @IsString()
  description: string;

  @IsNumber()
  probability: number;

  @IsNumber()
  impact: number;

  @IsNumber()
  score: number;

  @IsOptional()
  @IsString()
  mitigation?: string;

  @IsEnum(RiskLevel)
  severity: RiskLevel;
}

// DTO 29: RegulatoryRequirementDto
class RegulatoryRequirementDto {
  @IsString()
  jurisdiction: string;

  @IsArray()
  @IsString({ each: true })
  requirements: string[];

  @IsString()
  complianceLevel: 'none' | 'low' | 'medium' | 'high';

  @IsOptional()
  @IsNumber()
  cost?: number;

  @IsOptional()
  @IsNumber()
  time?: number;
}

// DTO 30: RecommendedActionDto
class RecommendedActionDto {
  @IsString()
  id: string;

  @IsString()
  type:
    | 'validate'
    | 'research'
    | 'build'
    | 'launch'
    | 'scale'
    | 'pivot'
    | 'kill'
    | 'pause'
    | 'monitor';

  @IsString()
  description: string;

  @IsNumber()
  priority: number;

  @IsOptional()
  @IsNumber()
  estimatedTime?: number;

  @IsOptional()
  @IsNumber()
  estimatedCost?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dependencies?: string[];

  @IsOptional()
  @IsString()
  owner?: 'ai' | 'user';
}

// DTO 31: DecisionDto
class DecisionDto {
  @IsString()
  id: string;

  @IsString()
  type:
    | 'approve'
    | 'reject'
    | 'defer'
    | 'pivot'
    | 'scale'
    | 'kill'
    | 'pause';

  @IsString()
  decision: string;

  @IsString()
  reason: string;

  @IsString()
  madeBy: 'ai' | 'user';

  @IsDateString()
  madeAt: string;

  @IsOptional()
  @IsNumber()
  confidence?: number;
}

// DTO 32: RelatedOpportunityDto
class RelatedOpportunityDto {
  @IsString()
  id: string;

  @IsString()
  title: string;

  @IsString()
  relationship:
    | 'similar'
    | 'complementary'
    | 'competitive'
    | 'parent'
    | 'child';
}

// DTO 33: SupportingDataDto
class SupportingDataDto {
  @IsString()
  id: string;

  @IsString()
  type:
    | 'article'
    | 'report'
    | 'video'
    | 'podcast'
    | 'social-post'
    | 'data'
    | 'case-study';

  @IsString()
  title: string;

  @IsUrl()
  url: string;

  @IsString()
  source: string;

  @IsNumber()
  relevance: number;

  @IsOptional()
  @IsString()
  summary?: string;
}

// DTO 34: PortfolioMetricsDto
class PortfolioMetricsDto {
  @IsOptional()
  @IsNumber()
  correlation?: number;

  @IsOptional()
  @IsNumber()
  diversificationBenefit?: number;

  @IsOptional()
  @IsNumber()
  portfolioRiskImpact?: number;
}

// DTO 35: PerformanceMetricsDto
class PerformanceMetricsDto {
  @IsOptional()
  @IsNumber()
  discoveryToValidationTime?: number;

  @IsOptional()
  @IsNumber()
  validationToLaunchTime?: number;

  @IsOptional()
  @IsNumber()
  launchToProfitabilityTime?: number;

  @IsOptional()
  @IsNumber()
  customerAcquisitionCost?: number;

  @IsOptional()
  @IsNumber()
  customerLifetimeValue?: number;

  @IsOptional()
  @IsNumber()
  conversionRate?: number;

  @IsOptional()
  @IsNumber()
  churnRate?: number;

  @IsOptional()
  @IsNumber()
  revenue?: number;

  @IsOptional()
  @IsNumber()
  profit?: number;

  @IsOptional()
  @IsNumber()
  roi?: number;
}

// DTO 36: LessonLearnedDto
class LessonLearnedDto {
  @IsString()
  id: string;

  @IsString()
  lesson: string;

  @IsString()
  category: 'success' | 'failure' | 'improvement' | 'warning';

  @IsNumber()
  impact: number;

  @IsBoolean()
  applied: boolean;

  @IsOptional()
  @IsDateString()
  appliedAt?: string;
}

// DTO 37: ImprovementSuggestionDto
class ImprovementSuggestionDto {
  @IsString()
  id: string;

  @IsString()
  suggestion: string;

  @IsString()
  category:
    | 'product'
    | 'marketing'
    | 'operations'
    | 'financial'
    | 'strategy';

  @IsNumber()
  priority: number;

  @IsOptional()
  @IsNumber()
  estimatedImpact?: number;

  @IsOptional()
  @IsNumber()
  feasibility?: number;
}

// DTO 38: AiAnalysisDto
class AiAnalysisDto {
  @IsOptional()
  @IsString()
  modelUsed?: string;

  @IsOptional()
  @IsDateString()
  analysisDate?: string;

  @IsOptional()
  @IsNumber()
  confidence?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  recommendations?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  warnings?: string[];
}

// DTO 39: AutomationPotentialDto
class AutomationPotentialDto {
  @IsOptional()
  @IsNumber()
  score?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AutomatableTaskDto)
  automatableTasks?: AutomatableTaskDto[];

  @IsOptional()
  @IsNumber()
  estimatedTimeSaved?: number;

  @IsOptional()
  @IsNumber()
  estimatedCostSaved?: number;
}

// DTO 40: AutomatableTaskDto
class AutomatableTaskDto {
  @IsString()
  task: string;

  @IsString()
  automationLevel: 'none' | 'partial' | 'full';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  toolsAvailable?: string[];

  @IsOptional()
  @IsString()
  implementationEffort?: 'low' | 'medium' | 'high';
}

// DTO 41: NotificationDto
class NotificationDto {
  @IsString()
  id: string;

  @IsString()
  type: 'info' | 'warning' | 'error' | 'success';

  @IsString()
  title: string;

  @IsString()
  message: string;

  @IsDateString()
  triggeredAt: string;

  @IsString()
  triggeredBy: 'system' | 'ai' | 'user';

  @IsOptional()
  @IsDateString()
  resolvedAt?: string;

  @IsOptional()
  @IsString()
  resolvedBy?: string;
}

// DTO 42: AlertDto
class AlertDto {
  @IsString()
  id: string;

  @IsString()
  type: 'threshold' | 'anomaly' | 'opportunity' | 'risk';

  @IsString()
  title: string;

  @IsString()
  description: string;

  @IsString()
  severity: 'low' | 'medium' | 'high' | 'critical';

  @IsDateString()
  triggeredAt: string;

  @IsString()
  triggeredBy: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ThresholdDto)
  threshold?: ThresholdDto;

  @IsOptional()
  @IsDateString()
  resolvedAt?: string;

  @IsOptional()
  @IsString()
  resolvedBy?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  actionsTaken?: string[];
}

// DTO 43: ThresholdDto
class ThresholdDto {
  @IsString()
  metric: string;

  @IsString()
  operator: '>' | '<' | '>=' | '<=' | '==' | '!=';

  @IsNumber()
  value: number;

  @IsNumber()
  actual: number;
}

// DTO 44: UserNoteDto
class UserNoteDto {
  @IsString()
  id: string;

  @IsString()
  note: string;

  @IsDateString()
  createdAt: string;

  @IsOptional()
  @IsDateString()
  updatedAt?: string;

  @IsString()
  author: string;
}

// DTO 45: TimelineEventDto
class TimelineEventDto {
  @IsString()
  event: string;

  @IsDateString()
  timestamp: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

// ============================================================================
// MAIN CREATE OPPORTUNITY DTO
// ============================================================================

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
  @IsJson()
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
ÿ