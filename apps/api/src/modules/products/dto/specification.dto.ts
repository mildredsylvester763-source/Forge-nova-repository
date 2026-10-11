// ============================================================================
// FILE: apps/api/src/modules/products/dto/specification.dto.ts
// ============================================================================

import { IsOptional, IsString, IsNumber, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class SpecificationDto {
  @IsOptional() @IsNumber() fileSize?: number;
  @IsOptional() @IsNumber() fileCount?: number;
  @IsOptional() @IsString() resolution?: string;
  @IsOptional() @IsNumber() duration?: number;
  @IsOptional() @IsNumber() bitrate?: number;
  @IsOptional() @IsNumber() sampleRate?: number;
  @IsOptional() @ValidateNested() @Type(() => DimensionsDto) dimensions?: DimensionsDto;
  @IsOptional() @IsNumber() weight?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) materials?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) colors?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) sizes?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) platform?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) browserSupport?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) dependencies?: string[];
  @IsOptional() @IsString() framework?: string;
  @IsOptional() @IsString() language?: string;
  @IsOptional() @IsString() version?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) features?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) benefits?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) useCases?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) targetAudience?: string[];
}

export class DimensionsDto {
  @IsOptional() @IsNumber() length?: number;
  @IsOptional() @IsNumber() width?: number;
  @IsOptional() @IsNumber() height?: number;
  @IsOptional() @IsString() unit?: 'cm' | 'mm' | 'in' | 'm';
}
