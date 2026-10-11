import {
  IsOptional, IsString, IsNumber, IsArray, IsBoolean, IsUrl, ValidateNested
} from 'class-validator';
import { Type } from 'class-transformer';
import { FinancialProjectionsDto } from './financials.dto';

export class CompetitorDto {
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

export class TrendDataDto {
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

export class GoogleTrendsDto {
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

export class InterestOverTimeDto {
  @IsString()
  date: string;

  @IsNumber()
  value: number;
}

// DTO 9: RegionalInterestDto

export class RegionalInterestDto {
  @IsString()
  region: string;

  @IsNumber()
  value: number;
}

// DTO 10: RelatedQueryDto

export class RelatedQueryDto {
  @IsString()
  query: string;

  @IsNumber()
  value: number;
}

// DTO 11: RelatedTopicDto

export class RelatedTopicDto {
  @IsString()
  topic: string;

  @IsNumber()
  value: number;
}

// DTO 12: SocialMediaDto

export class SocialMediaDto {
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

export class TwitterDto {
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

export class RedditDto {
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

export class InstagramDto {
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

export class SeasonalityDto {
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
