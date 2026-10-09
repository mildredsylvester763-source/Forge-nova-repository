import {
  IsString, IsNotEmpty, MaxLength, IsOptional, IsIn, IsArray, IsObject,
} from 'class-validator';

export class CreatePatternDto {
  @IsIn(['success', 'failure'])
  kind: 'success' | 'failure';

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  category: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  source?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  summary: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsObject()
  evidence?: Record<string, any>;
}

export class MatchPatternsDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  category: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  source?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class LearnFromExperimentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  category: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
