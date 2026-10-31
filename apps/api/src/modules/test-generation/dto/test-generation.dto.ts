import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

// DTOs for generated test suites (FORGE TQ-031..035). Engines own every
// law; these classes only shape the wire format.

export class UnitParamDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsIn(['string', 'number', 'boolean', 'array', 'object'])
  type: string;
}

export class UnitTargetDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsIn(['function', 'class'])
  kind: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UnitParamDto)
  params?: UnitParamDto[];
}

export class UnitBehaviorDto {
  @IsString()
  @IsNotEmpty()
  name: string;
}

export class UnitTestGenDto {
  @IsObject()
  @ValidateNested()
  @Type(() => UnitTargetDto)
  target: UnitTargetDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UnitBehaviorDto)
  behaviors: UnitBehaviorDto[];
}

export class IntegrationGraphDto {
  @IsArray()
  services: Array<string | { name: string }>;

  @IsArray()
  dependencies: unknown[];
}

export class E2eSessionNameDto {
  @IsString()
  @IsNotEmpty()
  name: string;
}

export class E2eStepDto {
  @IsString()
  @IsNotEmpty()
  action: string;

  @IsOptional()
  @IsString()
  target?: string;

  @IsOptional()
  @IsString()
  value?: string;

  @IsOptional()
  @IsBoolean()
  checkpoint?: boolean;
}

export class E2eSessionDto {
  @IsObject()
  @ValidateNested()
  @Type(() => E2eSessionNameDto)
  session: E2eSessionNameDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => E2eStepDto)
  steps: E2eStepDto[];
}

export class PropertySuiteDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsInt()
  runs?: number;

  @IsOptional()
  @IsInt()
  seed?: number;
}

export class FuzzFieldDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsIn(['string', 'int', 'bool', 'uuid'])
  type: string;

  @IsOptional()
  @IsBoolean()
  required?: boolean;
}

export class FuzzCampaignDto {
  @IsString()
  @IsNotEmpty()
  kind: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FuzzFieldDto)
  fields?: FuzzFieldDto[];

  @IsOptional()
  @IsArray()
  samples?: string[];

  @IsOptional()
  @IsInt()
  budget?: number;

  @IsOptional()
  @IsInt()
  seed?: number;
}
