// ============================================================================
// FILE: apps/api/src/modules/products/dto/quality-testing.dto.ts
// ============================================================================

import { IsOptional, IsString, IsNumber, IsArray, IsBoolean, IsDateString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class TestResultDto { @IsBoolean() passed:boolean; @IsOptional() @IsNumber() duration?:number; @IsOptional() @IsArray() @IsString({each:true}) errors?:string[]; }

export class TestDto { @IsString() id:string; @IsString() type:'unit'|'integration'|'e2e'|'manual'|'automated'; @IsString() name:string; @IsOptional() @IsString() description?:string; @IsOptional() @IsString() status?:'passed'|'failed'|'pending'|'skipped'; @IsOptional() @IsDateString() lastRun?:string; @IsOptional() @ValidateNested() @Type(() => TestResultDto) lastResult?:TestResultDto; @IsOptional() @IsNumber() coverage?:number; }

export class TestingDto { @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => TestDto) tests?:TestDto[]; @IsOptional() @IsNumber() coverage?:number; }

export class QualityMetricsDto { @IsOptional() @IsNumber() codeQuality?:number; @IsOptional() @IsNumber() security?:number; @IsOptional() @IsNumber() performance?:number; @IsOptional() @IsNumber() accessibility?:number; @IsOptional() @IsNumber() seo?:number; }

export class QualityIssueDto { @IsString() id:string; @IsString() type:'bug'|'vulnerability'|'performance'|'accessibility'|'code-smell'; @IsString() severity:'low'|'medium'|'high'|'critical'; @IsString() title:string; @IsString() description:string; @IsOptional() @IsString() location?:string; @IsOptional() @IsString() status?:'open'|'in-progress'|'resolved'|'wont-fix'; @IsOptional() @IsString() assignedTo?:string; @IsString() createdAt:string; @IsOptional() @IsDateString() resolvedAt?:string; }

export class QualityDto { @IsOptional() @IsNumber() score?:number; @IsOptional() @ValidateNested() @Type(() => QualityMetricsDto) metrics?:QualityMetricsDto; @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => QualityIssueDto) issues?:QualityIssueDto[]; }

export class TestingComplianceDto { @IsOptional() @IsBoolean() passed?:boolean; @IsOptional() @IsArray() @IsString({each:true}) standards?:string[]; }

export class ComplianceStandardDto { @IsString() name:string; @IsOptional() @IsString() version?:string; @IsOptional() @IsBoolean() compliant?:boolean; }
