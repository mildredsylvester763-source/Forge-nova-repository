// ============================================================================
// FILE: apps/api/src/modules/products/dto/content.dto.ts
// ============================================================================

import { IsOptional, IsString, IsNumber, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ChapterDto { @IsString() id: string; @IsString() title: string; @IsOptional() @IsString() description?: string; @IsOptional() @IsNumber() wordCount?: number; @IsOptional() @IsNumber() estimatedReadingTime?: number; }

export class ModuleDto { @IsString() id: string; @IsString() title: string; @IsOptional() @IsString() description?: string; @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => LessonDto) lessons?: LessonDto[]; }

export class LessonDto { @IsString() id: string; @IsString() title: string; @IsOptional() @IsString() content?: string; @IsOptional() @IsNumber() duration?: number; }

export class ContentDto {
  @IsOptional() @IsString() outline?: string;
  @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => ChapterDto) chapters?: ChapterDto[];
  @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => ModuleDto) modules?: ModuleDto[];
  @IsOptional() @IsNumber() pages?: number; @IsOptional() @IsNumber() wordCount?: number; @IsOptional() @IsNumber() readingTime?: number;
  @IsOptional() @IsNumber() videoCount?: number; @IsOptional() @IsNumber() audioCount?: number; @IsOptional() @IsNumber() imageCount?: number;
}
