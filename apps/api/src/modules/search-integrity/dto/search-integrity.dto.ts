import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';

export class StatementDto {
  @IsString()
  text: string;

  @IsArray()
  @IsString({ each: true })
  sourceIds: string[];
}

export class FactsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StatementDto)
  statements: StatementDto[];
}

export class QuotesDto {
  @IsString()
  license: string;

  @IsArray()
  @IsString({ each: true })
  quotes: string[];
}

export class ReferenceSearchDto {
  @IsString()
  query: string;

  @IsOptional()
  @IsString()
  medium?: string;

  @IsOptional()
  @IsString()
  license?: string;
}

export class CachePutDto {
  @IsString()
  key: string;

  @IsOptional()
  @IsString()
  lane?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(86400)
  ttlSeconds?: number;

  @IsOptional()
  payload?: unknown;
}

export class CacheGetDto {
  @IsString()
  key: string;
}

export class RateCheckDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1440)
  elapsedMinutes?: number;
}

export class ScanContentDto {
  @IsString()
  content: string;
}

export class PackArticleDto {
  @IsString()
  title: string;

  @IsString()
  topic: string;

  @IsInt()
  @Min(1)
  sizeKb: number;
}

export class PackBuildDto {
  @IsString()
  name: string;

  @IsArray()
  @IsString({ each: true })
  topics: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200000)
  budgetKb?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PackArticleDto)
  articles: PackArticleDto[];
}
