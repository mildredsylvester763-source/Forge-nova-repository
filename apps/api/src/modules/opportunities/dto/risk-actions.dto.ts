
import {
  IsOptional,
  IsString,
  IsNumber,
  IsEnum,
  IsArray,
} from 'class-validator';
import { RiskLevel } from '../enums';

export class RiskDto {
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

export class RegulatoryRequirementDto {
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

export class RecommendedActionDto {
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
