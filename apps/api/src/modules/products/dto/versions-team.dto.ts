// ============================================================================
// FILE: apps/api/src/modules/products/dto/versions-team.dto.ts
// ============================================================================

import { IsOptional, IsString, IsNumber, IsArray, IsUrl, IsDateString, ValidateNested, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';

export class RequirementsDto { @IsOptional() @IsArray() @IsString({each:true}) os?:string[]; @IsOptional() @IsArray() @IsString({each:true}) browser?:string[]; @IsOptional() @IsArray() @IsString({each:true}) dependencies?:string[]; }

export class VersionStatisticsDto { @IsOptional() @IsNumber() downloads?:number; @IsOptional() @IsNumber() activeUsers?:number; @IsOptional() @IsNumber() ratings?:number; @IsOptional() @IsNumber() reviews?:number; }

export class VersionDto { @IsString() id:string; @IsString() version:string; @IsOptional() @IsString() name?:string; @IsOptional() @IsString() description?:string; @IsOptional() @IsArray() @IsString({each:true}) changelog?:string[]; @IsOptional() @IsString() status?:'draft'|'beta'|'rc'|'stable'|'deprecated'; @IsOptional() @IsDateString() releasedAt?:string; @IsOptional() @IsString() releasedBy?:string; @IsOptional() @IsUrl() downloadUrl?:string; @IsOptional() @IsNumber() size?:number; @IsOptional() @IsString() checksum?:string; @IsOptional() @ValidateNested() @Type(() => RequirementsDto) requirements?:RequirementsDto; @IsOptional() @ValidateNested() @Type(() => VersionStatisticsDto) statistics?:VersionStatisticsDto; }

export class ContributorDto { @IsString() id:string; @IsOptional() @IsString() name?:string; @IsOptional() @IsString() role?:string; @IsOptional() @IsNumber() contributions?:number; }

export class ContributionDto { @IsOptional() @IsNumber() commits?:number; @IsOptional() @IsNumber() changes?:number; @IsOptional() @IsNumber() issues?:number; @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => ContributorDto) contributors?:ContributorDto[]; }

export class TeamMemberDto { @IsString() id:string; @IsOptional() @IsUUID() userId?:string; @IsString() role:'owner'|'admin'|'editor'|'contributor'|'viewer'; @IsOptional() @IsString() name?:string; @IsOptional() @IsString() email?:string; @IsOptional() @IsArray() @IsString({each:true}) permissions?:string[]; @IsOptional() @IsDateString() joinedAt?:string; @IsOptional() @IsDateString() lastActiveAt?:string; @IsOptional() @ValidateNested() @Type(() => ContributionDto) contribution?:ContributionDto; }
