import {
  IsOptional, IsString, IsNumber, IsArray, IsUrl, ValidateNested
} from 'class-validator';
import { Type } from 'class-transformer';
import { RiskDto } from './risk-actions.dto';

export class RequiredResourcesDto {
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

export class TimeDto {
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

export class BudgetDto {
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

export class TeamDto {
  @IsOptional()
  @IsNumber()
  size?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roles?: string[];
}

// DTO 26: FulfillmentOptionDto

export class FulfillmentOptionDto {
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

export class DistributionChannelDto {
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
