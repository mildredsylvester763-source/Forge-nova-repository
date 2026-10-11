import { Type } from 'class-transformer';

export class DecisionDto {
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

export class RelatedOpportunityDto {
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

export class SupportingDataDto {
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

export class AiAnalysisDto {
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

export class AutomationPotentialDto {
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

export class AutomatableTaskDto {
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
