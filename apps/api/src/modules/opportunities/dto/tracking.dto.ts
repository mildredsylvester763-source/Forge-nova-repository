import { Type } from 'class-transformer';

export class NotificationDto {
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

export class AlertDto {
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

export class ThresholdDto {
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

export class UserNoteDto {
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

export class TimelineEventDto {
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

export class PortfolioMetricsDto {
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

export class PerformanceMetricsDto {
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

export class LessonLearnedDto {
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

export class ImprovementSuggestionDto {
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
