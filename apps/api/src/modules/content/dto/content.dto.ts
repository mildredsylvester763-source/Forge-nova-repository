import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreatePostDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  slug: string;

  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  body: string;
}

export class AnalyzeSeoDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  title: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  metaDescription: string;

  @IsString()
  @MinLength(3)
  @MaxLength(80)
  slug: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  keyword: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  firstHeading?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  bodyText: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  targetId?: string;
}

export class SubscribeDto {
  @IsString()
  @MinLength(5)
  @MaxLength(254)
  email: string;
}

export class RecordIssueDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  subject: string;

  @IsArray()
  @ArrayMinSize(1)
  postIds: string[];
}
