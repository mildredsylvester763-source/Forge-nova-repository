// ============================================================================
// FILE: apps/api/src/modules/products/dto/design.dto.ts
// ============================================================================

import { IsOptional, IsString, IsNumber, IsArray, IsUrl, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class AssetDimensionsDto { @IsOptional() @IsNumber() width?: number; @IsOptional() @IsNumber() height?: number; @IsOptional() @IsNumber() depth?: number; @IsOptional() @IsString() unit?: string; }

export class AssetDto {
  @IsString() id: string; @IsOptional() @IsString() name?: string; @IsOptional() @IsString() type?: string; @IsOptional() @IsUrl() url?: string;
  @IsOptional() @IsString() altText?: string; @IsOptional() @IsNumber() size?: number; @IsOptional() @IsString() mimeType?: string;
  @IsOptional() @ValidateNested() @Type(() => AssetDimensionsDto) dimensions?: AssetDimensionsDto;
}

export class DesignDto { @IsOptional() @IsString() style?: string; @IsOptional() @ValidateNested() @Type(() => ThemeDto) theme?: ThemeDto; @IsOptional() @ValidateNested() @Type(() => LayoutDto) layout?: LayoutDto; @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => AssetDto) assets?: AssetDto[]; }

export class ThemeDto { @IsOptional() @IsString() name?: string; @IsOptional() @IsArray() @IsString({each:true}) colors?: string[]; @IsOptional() @IsString() fontFamily?: string; @IsOptional() @IsString() style?: string; }

export class LogoDto { @IsOptional() @IsUrl() url?: string; @IsOptional() @IsString() altText?: string; @IsOptional() @IsUrl() favicon?: string; }

export class BrandingDto { @IsOptional() @IsString() name?: string; @IsOptional() @IsString() tagline?: string; @IsOptional() @IsString() brandVoice?: string; @IsOptional() @IsArray() @IsString({each:true}) tone?: string[]; }

export class LayoutDto { @IsOptional() @IsString() type?: 'single-column'|'two-column'|'grid'|'custom'; @IsOptional() @IsString() template?: string; }
