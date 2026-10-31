import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class RawResultDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2048)
  url: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  snippet?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  authorityScore?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  publishedAt?: string;
}

export class SearchWebDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  query: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  workspace?: string;

  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => RawResultDto)
  results: RawResultDto[];
}

export class FetchPageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2048)
  url: string;

  @IsString()
  @MinLength(1)
  @MaxLength(300000)
  html: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  workspace?: string;
}

export class CreateCitationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  claim: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2048)
  sourceUrl: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  sourceTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  quote?: string;
}

export class DomainRulesDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  workspace?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  allow?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  deny?: string[];
}
