import {
  IsOptional, IsString, IsNumber, IsEnum, IsArray, IsBoolean, IsUrl,
  IsDateString, ValidateNested, IsUUID, IsJson
} from 'class-validator';
import { Type } from 'class-transformer';
import { ProductType, ProductFormat, ProductStatus } from '../enums';

class SpecificationDto {
  @IsOptional() @IsNumber() fileSize?: number;
  @IsOptional() @IsNumber() fileCount?: number;
  @IsOptional() @IsString() resolution?: string;
  @IsOptional() @IsNumber() duration?: number;
  @IsOptional() @IsNumber() bitrate?: number;
  @IsOptional() @IsNumber() sampleRate?: number;
  @IsOptional() @ValidateNested() @Type(() => DimensionsDto) dimensions?: DimensionsDto;
  @IsOptional() @IsNumber() weight?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) materials?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) colors?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) sizes?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) platform?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) browserSupport?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) dependencies?: string[];
  @IsOptional() @IsString() framework?: string;
  @IsOptional() @IsString() language?: string;
  @IsOptional() @IsString() version?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) features?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) benefits?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) useCases?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) targetAudience?: string[];
}

class DimensionsDto {
  @IsOptional() @IsNumber() length?: number;
  @IsOptional() @IsNumber() width?: number;
  @IsOptional() @IsNumber() height?: number;
  @IsOptional() @IsString() unit?: 'cm' | 'mm' | 'in' | 'm';
}
class ChapterDto { @IsString() id: string; @IsString() title: string; @IsOptional() @IsString() description?: string; @IsOptional() @IsNumber() wordCount?: number; @IsOptional() @IsNumber() estimatedReadingTime?: number; }
class ModuleDto { @IsString() id: string; @IsString() title: string; @IsOptional() @IsString() description?: string; @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => LessonDto) lessons?: LessonDto[]; }
class LessonDto { @IsString() id: string; @IsString() title: string; @IsOptional() @IsString() content?: string; @IsOptional() @IsNumber() duration?: number; }
class ContentDto {
  @IsOptional() @IsString() outline?: string;
  @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => ChapterDto) chapters?: ChapterDto[];
  @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => ModuleDto) modules?: ModuleDto[];
  @IsOptional() @IsNumber() pages?: number; @IsOptional() @IsNumber() wordCount?: number; @IsOptional() @IsNumber() readingTime?: number;
  @IsOptional() @IsNumber() videoCount?: number; @IsOptional() @IsNumber() audioCount?: number; @IsOptional() @IsNumber() imageCount?: number;
}
class AssetDimensionsDto { @IsOptional() @IsNumber() width?: number; @IsOptional() @IsNumber() height?: number; @IsOptional() @IsNumber() depth?: number; @IsOptional() @IsString() unit?: string; }
class AssetDto {
  @IsString() id: string; @IsOptional() @IsString() name?: string; @IsOptional() @IsString() type?: string; @IsOptional() @IsUrl() url?: string;
  @IsOptional() @IsString() altText?: string; @IsOptional() @IsNumber() size?: number; @IsOptional() @IsString() mimeType?: string;
  @IsOptional() @ValidateNested() @Type(() => AssetDimensionsDto) dimensions?: AssetDimensionsDto;
}
class DesignDto { @IsOptional() @IsString() style?: string; @IsOptional() @ValidateNested() @Type(() => ThemeDto) theme?: ThemeDto; @IsOptional() @ValidateNested() @Type(() => LayoutDto) layout?: LayoutDto; @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => AssetDto) assets?: AssetDto[]; }
class ThemeDto { @IsOptional() @IsString() name?: string; @IsOptional() @IsArray() @IsString({each:true}) colors?: string[]; @IsOptional() @IsString() fontFamily?: string; @IsOptional() @IsString() style?: string; }
class LogoDto { @IsOptional() @IsUrl() url?: string; @IsOptional() @IsString() altText?: string; @IsOptional() @IsUrl() favicon?: string; }
class BrandingDto { @IsOptional() @IsString() name?: string; @IsOptional() @IsString() tagline?: string; @IsOptional() @IsString() brandVoice?: string; @IsOptional() @IsArray() @IsString({each:true}) tone?: string[]; }
class LayoutDto { @IsOptional() @IsString() type?: 'single-column'|'two-column'|'grid'|'custom'; @IsOptional() @IsString() template?: string; }

class PricingDto {
  @IsString() model: 'free'|'one-time'|'subscription'|'freemium'|'pay-what-you-want'|'donation'|'tiered';
  @IsOptional() @IsNumber() price?: number; @IsOptional() @IsNumber() salePrice?: number; @IsOptional() @IsString() currency?: string;
  @IsOptional() @ValidateNested() @Type(() => SubscriptionDto) subscription?: SubscriptionDto;
  @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => TierDto) tiers?: TierDto[];
  @IsOptional() @ValidateNested() @Type(() => CostDto) cost?: CostDto;
  @IsOptional() @IsNumber() profitMargin?: number; @IsOptional() @IsNumber() breakEvenUnits?: number;
  @IsOptional() @IsBoolean() taxIncluded?: boolean; @IsOptional() @IsNumber() taxRate?: number;
  @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => VatDto) vats?: VatDto[];
}
class SubscriptionDto { @IsString() interval:'daily'|'weekly'|'monthly'|'quarterly'|'yearly'; @IsNumber() amount:number; @IsOptional() @IsNumber() trialDays?:number; @IsOptional() @IsNumber() setupFee?:number; }
class TierDto { @IsString() id:string; @IsString() name:string; @IsOptional() @IsString() description?:string; @IsNumber() price:number; @IsOptional() @IsArray() @IsString({each:true}) features?:string[]; @IsOptional() @IsNumber() maxUsers?:number; @IsOptional() @IsNumber() maxUsage?:number; }
class CostDto { @IsOptional() @IsNumber() production?:number; @IsOptional() @IsNumber() distribution?:number; @IsOptional() @IsNumber() marketing?:number; @IsOptional() @IsNumber() total?:number; }
class VatDto { @IsString() country:string; @IsNumber() rate:number; }
class PaymentOptionDto { @IsString() type:string; @IsOptional() @IsString() provider?:string; @IsOptional() @IsBoolean() enabled?:boolean; @IsOptional() @IsNumber() fee?:number; }
class DownloadDeliveryDto { @IsOptional() @IsUrl() url?:string; @IsOptional() @IsNumber() expiresIn?:number; @IsOptional() @IsNumber() maxDownloads?:number; }
class PhysicalDeliveryDto { @IsOptional() @IsString() address?:string; @IsOptional() @IsString() carrier?:string; @IsOptional() @IsString() trackingNumber?:string; }
class DeliveryDto { @IsOptional() @ValidateNested() @Type(() => DownloadDeliveryDto) download?:DownloadDeliveryDto; @IsOptional() @ValidateNested() @Type(() => PhysicalDeliveryDto) physical?:PhysicalDeliveryDto; @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => PaymentOptionDto) paymentOptions?:PaymentOptionDto[]; }

class ShippingDto { @IsBoolean() enabled:boolean; @IsOptional() @IsArray() @IsString({each:true}) providers?:string[]; @IsOptional() @IsArray() @IsString({each:true}) countries?:string[]; @IsOptional() @IsNumber() shippingCost?:number; @IsOptional() @IsString() handlingTime?:string; @IsOptional() @IsBoolean() tracking?:boolean; }
class FulfillmentDto { @IsString() type:'self'|'dropshipping'|'print-on-demand'|'third-party'; @IsOptional() @IsString() provider?:string; @IsOptional() @IsString() location?:string; }
class ServiceDeliveryDto { @IsString() type:'consultation'|'coaching'|'development'|'design'|'other'; @IsOptional() @IsNumber() duration?:number; @IsOptional() @IsString() format?:'video-call'|'in-person'|'email'|'chat'|'asynchronous'; @IsOptional() @ValidateNested() @Type(() => SchedulingDto) scheduling?:SchedulingDto; }
class SchedulingDto { @IsBoolean() enabled:boolean; @IsOptional() @IsUrl() calendarUrl?:string; @IsOptional() @IsString() availability?:string; }
class ApiDeliveryDto { @IsOptional() @IsString() endpoint?:string; @IsOptional() @IsUrl() documentationUrl?:string; @IsOptional() @IsNumber() rateLimit?:number; @IsOptional() @IsString() authentication?:'none'|'api-key'|'oauth'|'jwt'; }
class IntegrationDto { @IsString() type:'api'|'webhook'|'manual'|'zapier'; @IsBoolean() configured:boolean; @IsOptional() @IsString() lastSync?:string; }
class DistributionChannelDto { @IsString() id:string; @IsString() type:'own-website'|'marketplace'|'social-media'|'email'|'affiliate'|'wholesale'|'retail'; @IsString() name:string; @IsOptional() @IsUrl() url?:string; @IsBoolean() enabled:boolean; @IsOptional() @IsNumber() commission?:number; @IsOptional() @IsNumber() fees?:number; @IsOptional() @IsNumber() reach?:number; @IsOptional() @ValidateNested() @Type(() => IntegrationDto) integration?:IntegrationDto; }

class MarketingDto { @IsOptional() @ValidateNested() @Type(() => SeoDto) seo?:SeoDto; @IsOptional() @ValidateNested() @Type(() => ContentMarketingDto) content?:ContentMarketingDto; @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => SocialPostDto) socialPosts?:SocialPostDto[]; @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => AdDto) ads?:AdDto[]; }
class SeoDto { @IsOptional() @IsString() title?:string; @IsOptional() @IsString() description?:string; @IsOptional() @IsArray() @IsString({each:true}) keywords?:string[]; @IsOptional() @IsString() canonicalUrl?:string; }
class ContentMarketingDto { @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => BlogPostDto) blogPosts?:BlogPostDto[]; @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => VideoDto) videos?:VideoDto[]; }
class BlogPostDto { @IsString() id:string; @IsString() title:string; @IsOptional() @IsString() content?:string; @IsOptional() @IsUrl() url?:string; @IsOptional() @IsDateString() publishedAt?:string; }
class SocialPostDto { @IsString() id:string; @IsString() platform:string; @IsString() content:string; @IsOptional() @IsUrl() url?:string; @IsOptional() @IsBoolean() published?:boolean; @IsOptional() @IsDateString() publishedAt?:string; @IsOptional() @ValidateNested() @Type(() => EngagementDto) engagement?:EngagementDto; }
class EngagementDto { @IsOptional() @IsNumber() likes?:number; @IsOptional() @IsNumber() shares?:number; @IsOptional() @IsNumber() comments?:number; }
class VideoDto { @IsString() id:string; @IsString() title:string; @IsOptional() @IsUrl() url?:string; @IsOptional() @IsString() platform?:string; @IsOptional() @IsBoolean() published?:boolean; @IsOptional() @IsDateString() publishedAt?:string; @IsOptional() @IsNumber() views?:number; }
class EmailDto { @IsString() id:string; @IsString() subject:string; @IsOptional() @IsString() preview?:string; @IsOptional() @IsBoolean() sent?:boolean; @IsOptional() @IsDateString() sentAt?:string; @IsOptional() @IsNumber() openRate?:number; @IsOptional() @IsNumber() clickRate?:number; }
class AdDto { @IsString() id:string; @IsString() platform:string; @IsString() campaign:string; @IsNumber() budget:number; @IsOptional() @IsNumber() spent?:number; @IsOptional() @IsNumber() clicks?:number; @IsOptional() @IsNumber() impressions?:number; @IsOptional() @IsNumber() conversions?:number; @IsOptional() @IsNumber() ctr?:number; @IsOptional() @IsNumber() cpc?:number; @IsOptional() @IsNumber() roi?:number; }
class AffiliateDto { @IsString() id:string; @IsString() name:string; @IsNumber() commission:number; @IsOptional() @IsNumber() sales?:number; @IsOptional() @IsNumber() revenue?:number; @IsOptional() @IsString() status?:'active'|'inactive'|'pending'; }

class SalesMetricsDto { @IsOptional() @IsNumber() revenue?:number; @IsOptional() @IsNumber() orders?:number; @IsOptional() @IsNumber() averageOrderValue?:number; @IsOptional() @IsNumber() growth?:number; }
class FunnelDto { @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => FunnelStepDto) steps?:FunnelStepDto[]; }
class SalesDto { @IsOptional() @ValidateNested() @Type(() => FunnelDto) funnel?:FunnelDto; @IsOptional() @ValidateNested() @Type(() => SalesMetricsDto) metrics?:SalesMetricsDto; @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => AffiliateDto) affiliates?:AffiliateDto[]; }

class TermsDto { @IsOptional() @IsString() content?:string; @IsOptional() @IsUrl() url?:string; @IsOptional() @IsString() version?:string; @IsOptional() @IsDateString() lastUpdated?:string; @IsOptional() @IsBoolean() accepted?:boolean; }
class PrivacyPolicyDto { @IsOptional() @IsString() content?:string; @IsOptional() @IsUrl() url?:string; @IsOptional() @IsString() version?:string; @IsOptional() @IsDateString() lastUpdated?:string; }
class RefundPolicyDto { @IsOptional() @IsString() type?:'no-refunds'|'full-refund'|'partial-refund'|'store-credit'; @IsOptional() @IsNumber() days?:number; @IsOptional() @IsArray() @IsString({each:true}) conditions?:string[]; @IsOptional() @IsString() content?:string; }
class LicenseDto { @IsString() id:string; @IsString() type:'commercial'|'personal'|'educational'|'open-source'; @IsOptional() @IsString() name?:string; @IsOptional() @IsString() content?:string; @IsOptional() @IsUrl() url?:string; @IsOptional() @IsNumber() price?:number; }
class AgeRestrictionsDto { @IsBoolean() enabled:boolean; @IsOptional() @IsNumber() minAge?:number; @IsOptional() @IsBoolean() verificationRequired?:boolean; }
class RegionalComplianceDto { @IsString() region:string; @IsBoolean() compliant:boolean; @IsOptional() @IsArray() @IsString({each:true}) requirements?:string[]; }
class IpDto { @IsOptional() @IsBoolean() registered?:boolean; @IsOptional() @IsString() owner?:string; @IsOptional() @IsString() license?:string; }
class CopyrightDto { @IsOptional() @IsString() holder?:string; @IsOptional() @IsDateString() year?:string; @IsOptional() @IsString() registration?:string; }
class TrademarkDto { @IsOptional() @IsString() name?:string; @IsOptional() @IsString() registration?:string; @IsOptional() @IsString() jurisdiction?:string; }
class PatentDto { @IsOptional() @IsString() number?:string; @IsOptional() @IsString() title?:string; @IsOptional() @IsString() jurisdiction?:string; }
class RegulatoryDto { @IsString() complianceLevel:'none'|'low'|'medium'|'high'; @IsOptional() @IsNumber() cost?:number; @IsOptional() @IsNumber() time?:number; @IsOptional() @IsString() status?:'pending'|'compliant'|'non-compliant'|'exempt'; @IsOptional() @IsArray() @IsString({each:true}) documentation?:string[]; }
class ComplianceDto { @IsOptional() @IsBoolean() gdpr?:boolean; @IsOptional() @IsBoolean() ccpa?:boolean; @IsOptional() @IsBoolean() hipaa?:boolean; @IsOptional() @IsBoolean() pciDss?:boolean; @IsOptional() @ValidateNested() @Type(() => AgeRestrictionsDto) ageRestrictions?:AgeRestrictionsDto; @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => RegionalComplianceDto) regional?:RegionalComplianceDto[]; @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => RegulatoryDto) regulatory?:RegulatoryDto[]; }
class LegalDto { @IsOptional() @ValidateNested() @Type(() => TermsDto) termsAndConditions?:TermsDto; @IsOptional() @ValidateNested() @Type(() => PrivacyPolicyDto) privacyPolicy?:PrivacyPolicyDto; @IsOptional() @ValidateNested() @Type(() => RefundPolicyDto) refundPolicy?:RefundPolicyDto; @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => LicenseDto) licenses?:LicenseDto[]; @IsOptional() @ValidateNested() @Type(() => ComplianceDto) compliance?:ComplianceDto; @IsOptional() @ValidateNested() @Type(() => IpDto) ip?:IpDto; @IsOptional() @ValidateNested() @Type(() => CopyrightDto) copyright?:CopyrightDto; @IsOptional() @ValidateNested() @Type(() => TrademarkDto) trademark?:TrademarkDto; @IsOptional() @ValidateNested() @Type(() => PatentDto) patent?:PatentDto; }

class RequirementsDto { @IsOptional() @IsArray() @IsString({each:true}) os?:string[]; @IsOptional() @IsArray() @IsString({each:true}) browser?:string[]; @IsOptional() @IsArray() @IsString({each:true}) dependencies?:string[]; }
class VersionStatisticsDto { @IsOptional() @IsNumber() downloads?:number; @IsOptional() @IsNumber() activeUsers?:number; @IsOptional() @IsNumber() ratings?:number; @IsOptional() @IsNumber() reviews?:number; }
class VersionDto { @IsString() id:string; @IsString() version:string; @IsOptional() @IsString() name?:string; @IsOptional() @IsString() description?:string; @IsOptional() @IsArray() @IsString({each:true}) changelog?:string[]; @IsOptional() @IsString() status?:'draft'|'beta'|'rc'|'stable'|'deprecated'; @IsOptional() @IsDateString() releasedAt?:string; @IsOptional() @IsString() releasedBy?:string; @IsOptional() @IsUrl() downloadUrl?:string; @IsOptional() @IsNumber() size?:number; @IsOptional() @IsString() checksum?:string; @IsOptional() @ValidateNested() @Type(() => RequirementsDto) requirements?:RequirementsDto; @IsOptional() @ValidateNested() @Type(() => VersionStatisticsDto) statistics?:VersionStatisticsDto; }

class ContributorDto { @IsString() id:string; @IsOptional() @IsString() name?:string; @IsOptional() @IsString() role?:string; @IsOptional() @IsNumber() contributions?:number; }
class ContributionDto { @IsOptional() @IsNumber() commits?:number; @IsOptional() @IsNumber() changes?:number; @IsOptional() @IsNumber() issues?:number; @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => ContributorDto) contributors?:ContributorDto[]; }
class TeamMemberDto { @IsString() id:string; @IsOptional() @IsUUID() userId?:string; @IsString() role:'owner'|'admin'|'editor'|'contributor'|'viewer'; @IsOptional() @IsString() name?:string; @IsOptional() @IsString() email?:string; @IsOptional() @IsArray() @IsString({each:true}) permissions?:string[]; @IsOptional() @IsDateString() joinedAt?:string; @IsOptional() @IsDateString() lastActiveAt?:string; @IsOptional() @ValidateNested() @Type(() => ContributionDto) contribution?:ContributionDto; }

class AnalyticsDto { @IsOptional() @ValidateNested() @Type(() => UsageDto) usage?:UsageDto; @IsOptional() @ValidateNested() @Type(() => EngagementAnalyticsDto) engagement?:EngagementAnalyticsDto; @IsOptional() @ValidateNested() @Type(() => ConversionDto) conversion?:ConversionDto; @IsOptional() @ValidateNested() @Type(() => RevenueAnalyticsDto) revenue?:RevenueAnalyticsDto; @IsOptional() @ValidateNested() @Type(() => RetentionDto) retention?:RetentionDto; @IsOptional() @ValidateNested() @Type(() => TechnicalDto) technical?:TechnicalDto; @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => InsightDto) insights?:InsightDto[]; }
class UsageDto { @IsOptional() @IsNumber() totalUsers?:number; @IsOptional() @IsNumber() activeUsers?:number; @IsOptional() @IsNumber() sessions?:number; @IsOptional() @IsNumber() sessionDuration?:number; @IsOptional() @IsNumber() pageViews?:number; @IsOptional() @IsNumber() uniqueVisitors?:number; }
class EngagementAnalyticsDto { @IsOptional() @IsNumber() likes?:number; @IsOptional() @IsNumber() shares?:number; @IsOptional() @IsNumber() comments?:number; @IsOptional() @IsNumber() ratings?:number; @IsOptional() @IsNumber() averageRating?:number; @IsOptional() @IsNumber() reviews?:number; @IsOptional() @IsNumber() favorites?:number; }
class ConversionDto { @IsOptional() @IsNumber() visitors?:number; @IsOptional() @IsNumber() leads?:number; @IsOptional() @IsNumber() trials?:number; @IsOptional() @IsNumber() customers?:number; @IsOptional() @IsNumber() conversionRate?:number; @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => FunnelStepDto) funnel?:FunnelStepDto[]; }
class FunnelStepDto { @IsString() step:string; @IsNumber() users:number; @IsNumber() conversionRate:number; }
class RevenueAnalyticsDto { @IsOptional() @IsNumber() revenue?:number; @IsOptional() @IsNumber() recurringRevenue?:number; @IsOptional() @IsNumber() averageRevenuePerUser?:number; @IsOptional() @IsNumber() growth?:number; }
class RetentionDto { @IsOptional() @IsNumber() retentionRate?:number; @IsOptional() @IsNumber() churnRate?:number; @IsOptional() @IsNumber() returningUsers?:number; }
class TechnicalDto { @IsOptional() @IsNumber() uptime?:number; @IsOptional() @IsNumber() errorRate?:number; @IsOptional() @IsNumber() responseTime?:number; }
class InsightDto { @IsString() id:string; @IsString() title:string; @IsOptional() @IsString() description?:string; @IsOptional() @IsString() severity?:'info'|'low'|'medium'|'high'|'critical'; @IsOptional() @IsString() recommendation?:string; }

class AiAgentPerformanceDto { @IsOptional() @IsNumber() tasksCompleted?:number; @IsOptional() @IsNumber() successRate?:number; @IsOptional() @IsNumber() averageLatency?:number; @IsOptional() @IsNumber() cost?:number; }
class AiAgentDto { @IsString() id:string; @IsString() name:string; @IsOptional() @IsString() purpose?:string; @IsOptional() @IsBoolean() enabled?:boolean; @IsOptional() @ValidateNested() @Type(() => AiAgentPerformanceDto) performance?:AiAgentPerformanceDto; }
class AiAutomationDto { @IsOptional() @IsBoolean() enabled?:boolean; @IsOptional() @IsArray() @IsString({each:true}) triggers?:string[]; @IsOptional() @IsArray() @IsString({each:true}) actions?:string[]; }
class AutomationDto { @IsBoolean() enabled:boolean; @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => WorkflowDto) workflows?:WorkflowDto[]; @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => AiAgentDto) aiAgents?:AiAgentDto[]; @IsOptional() @ValidateNested() @Type(() => AiAutomationDto) aiAutomation?:AiAutomationDto; }
class TriggerDto { @IsString() type:'manual'|'scheduled'|'event-based'|'webhook'; @IsOptional() @IsString() event?:string; @IsOptional() @IsString() schedule?:string; }
class ActionDto { @IsString() id:string; @IsString() type:'create'|'update'|'delete'|'notify'|'integrate'|'custom'; @IsOptional() @IsString() service?:string; @IsOptional() @IsJson() configuration?:any; @IsOptional() @IsNumber() order?:number; }
class ConditionDto { @IsString() field:string; @IsString() operator:'=='|'!='|'>'|'<'|'>='|'<='|'contains'|'in'; @IsJson() value:any; }
class WorkflowDto { @IsString() id:string; @IsString() name:string; @IsOptional() @IsString() description?:string; @IsOptional() @ValidateNested() @Type(() => TriggerDto) trigger?:TriggerDto; @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => ActionDto) actions?:ActionDto[]; @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => ConditionDto) conditions?:ConditionDto[]; @IsBoolean() enabled:boolean; @IsOptional() @IsDateString() lastRun?:string; @IsOptional() @IsDateString() nextRun?:string; @IsOptional() @IsNumber() runCount?:number; @IsOptional() @IsString() status?:'idle'|'running'|'paused'|'failed'; }

class ProductGenerationDto { @IsOptional() @IsString() model?:string; @IsOptional() @IsString() prompt?:string; @IsOptional() @IsNumber() confidence?:number; @IsOptional() @IsNumber() iterations?:number; }
class ContentGenerationDto { @IsOptional() @IsBoolean() enabled?:boolean; @IsOptional() @IsString() model?:string; @IsOptional() @IsArray() @IsString({each:true}) outputs?:string[]; }
class MarketingAutomationDto { @IsOptional() @IsBoolean() enabled?:boolean; @IsOptional() @IsArray() @IsString({each:true}) campaigns?:string[]; }
class CustomerSupportDto { @IsOptional() @IsBoolean() enabled?:boolean; @IsOptional() @IsArray() @IsString({each:true}) channels?:string[]; @IsOptional() @IsString() responsePolicy?:string; }

class TestResultDto { @IsBoolean() passed:boolean; @IsOptional() @IsNumber() duration?:number; @IsOptional() @IsArray() @IsString({each:true}) errors?:string[]; }
class TestDto { @IsString() id:string; @IsString() type:'unit'|'integration'|'e2e'|'manual'|'automated'; @IsString() name:string; @IsOptional() @IsString() description?:string; @IsOptional() @IsString() status?:'passed'|'failed'|'pending'|'skipped'; @IsOptional() @IsDateString() lastRun?:string; @IsOptional() @ValidateNested() @Type(() => TestResultDto) lastResult?:TestResultDto; @IsOptional() @IsNumber() coverage?:number; }
class TestingDto { @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => TestDto) tests?:TestDto[]; @IsOptional() @IsNumber() coverage?:number; }
class QualityMetricsDto { @IsOptional() @IsNumber() codeQuality?:number; @IsOptional() @IsNumber() security?:number; @IsOptional() @IsNumber() performance?:number; @IsOptional() @IsNumber() accessibility?:number; @IsOptional() @IsNumber() seo?:number; }
class QualityIssueDto { @IsString() id:string; @IsString() type:'bug'|'vulnerability'|'performance'|'accessibility'|'code-smell'; @IsString() severity:'low'|'medium'|'high'|'critical'; @IsString() title:string; @IsString() description:string; @IsOptional() @IsString() location?:string; @IsOptional() @IsString() status?:'open'|'in-progress'|'resolved'|'wont-fix'; @IsOptional() @IsString() assignedTo?:string; @IsString() createdAt:string; @IsOptional() @IsDateString() resolvedAt?:string; }
class QualityDto { @IsOptional() @IsNumber() score?:number; @IsOptional() @ValidateNested() @Type(() => QualityMetricsDto) metrics?:QualityMetricsDto; @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => QualityIssueDto) issues?:QualityIssueDto[]; }
class TestingComplianceDto { @IsOptional() @IsBoolean() passed?:boolean; @IsOptional() @IsArray() @IsString({each:true}) standards?:string[]; }
class ComplianceStandardDto { @IsString() name:string; @IsOptional() @IsString() version?:string; @IsOptional() @IsBoolean() compliant?:boolean; }

class EndpointDto { @IsString() path:string; @IsString() method:string; @IsOptional() @IsString() description?:string; }
class ApiReferenceDto { @IsOptional() @IsString() version?:string; @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => EndpointDto) endpoints?:EndpointDto[]; }
class SdkDto { @IsString() language:string; @IsOptional() @IsString() packageName?:string; @IsOptional() @IsString() version?:string; }
class DeveloperGuideDto { @IsOptional() @IsString() content?:string; @IsOptional() @IsUrl() url?:string; }
class UserGuideDto { @IsOptional() @IsString() content?:string; @IsOptional() @IsUrl() url?:string; }
class DocumentationDto { @IsOptional() @ValidateNested() @Type(() => UserGuideDto) userGuide?:UserGuideDto; @IsOptional() @ValidateNested() @Type(() => DeveloperGuideDto) developerGuide?:DeveloperGuideDto; @IsOptional() @ValidateNested() @Type(() => ApiReferenceDto) apiReference?:ApiReferenceDto; @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => SdkDto) sdks?:SdkDto[]; }

class FaqDto { @IsString() id:string; @IsString() question:string; @IsString() answer:string; @IsOptional() @IsString() category?:string; }
class TutorialStepDto { @IsString() id:string; @IsString() title:string; @IsString() content:string; @IsOptional() @IsNumber() duration?:number; }
class TutorialDto { @IsString() id:string; @IsString() title:string; @IsOptional() @IsString() description?:string; @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => TutorialStepDto) steps?:TutorialStepDto[]; @IsOptional() @IsNumber() estimatedTime?:number; @IsOptional() @IsString() difficulty?:'beginner'|'intermediate'|'advanced'; }
class ChangeDto { @IsString() type:'added'|'changed'|'fixed'|'removed'|'security'|'deprecated'; @IsString() content:string; }
class ChangelogDto { @IsString() id:string; @IsString() version:string; @IsString() date:string; @IsString() title:string; @IsOptional() @IsString() description?:string; @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => ChangeDto) changes?:ChangeDto[]; }
class SupportChannelDto { @IsString() type:string; @IsOptional() @IsString() name?:string; @IsOptional() @IsUrl() url?:string; @IsOptional() @IsString() contact?:string; }
class ForumDto { @IsOptional() @IsString() url?:string; @IsOptional() @IsNumber() members?:number; }
class ChatDto { @IsOptional() @IsString() provider?:string; @IsOptional() @IsUrl() url?:string; }
class SocialDto { @IsString() platform:string; @IsOptional() @IsUrl() url?:string; }
class CommunityDto { @IsOptional() @ValidateNested() @Type(() => ForumDto) forum?:ForumDto; @IsOptional() @ValidateNested() @Type(() => ChatDto) chat?:ChatDto; @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => SocialDto) social?:SocialDto[]; }
class KnowledgeBaseArticleDto { @IsString() id:string; @IsString() title:string; @IsOptional() @IsString() content?:string; @IsOptional() @IsUrl() url?:string; }
class SupportDto { @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => SupportChannelDto) channels?:SupportChannelDto[]; @IsOptional() @ValidateNested() @Type(() => CommunityDto) community?:CommunityDto; @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => KnowledgeBaseArticleDto) knowledgeBase?:KnowledgeBaseArticleDto[]; }

class TimelineDto { @IsString() id:string; @IsDateString() date:string; @IsOptional() @IsString() status?:'pending'|'completed'|'overdue'|'cancelled'; @IsOptional() @IsString() priority?:'low'|'medium'|'high'|'critical'; @IsOptional() @IsString() assignedTo?:string; @IsOptional() @IsArray() @IsString({each:true}) dependencies?:string[]; }

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
  @IsOptional() @IsJson() workflow?:{currentStep?:string; totalSteps?:number; completedSteps?:number; progress?:number; blocked?:boolean; blockingReason?:string};
  @IsOptional() @IsBoolean() aiGenerated?:boolean;
  @IsOptional() @IsJson() aiGeneration?:{modelUsed?:string; prompt?:string; generationDate?:string; confidence?:number; iterations?:number; temperature?:number; topP?:number; maxTokens?:number; generationTime?:number; cost?:number};
  @IsOptional() @IsJson() aiOptimization?:{optimizedForSEO?:boolean; optimizedForConversion?:boolean; optimizedForAccessibility?:boolean; optimizationScore?:number; suggestions?:string[]};
  @IsOptional() @IsBoolean() isPublic?:boolean;
  @IsOptional() @IsBoolean() isFeatured?:boolean;
  @IsOptional() @IsBoolean() isArchived?:boolean;
}
