import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class LibraryDocsSearchDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  library: string;

  @IsString()
  @MinLength(1)
  @MaxLength(32)
  version: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  query: string;
}

export class ContentItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(16)
  source: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  title: string;

  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  links?: string[];
}

export class RecordContentItemsDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ContentItemDto)
  items: ContentItemDto[];
}

export class WorkspaceSearchDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  query: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  sources?: string[];
}

export class HybridWeightsDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  keyword?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  vector?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  graph?: number;
}

export class HybridSearchDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  query: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsString({ each: true })
  lanes?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => HybridWeightsDto)
  weights?: HybridWeightsDto;
}

export class RerankCandidateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  key: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  body?: string;

  @IsNumber()
  score: number;
}

export class RerankDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => RerankCandidateDto)
  candidates: RerankCandidateDto[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  lambda?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  depth?: number;
}

export class ResearchPlanDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  topic: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @IsString({ each: true })
  steps?: string[];
}

export class ResearchFindingDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  claim: string;

  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  sources: string[];
}

export class ResearchReportDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  topic: string;

  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ResearchFindingDto)
  findings: ResearchFindingDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  openQuestions?: string[];
}
