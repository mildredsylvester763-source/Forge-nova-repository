// ============================================================================
// FILE: apps/api/src/modules/products/dto/documentation-support.dto.ts
// ============================================================================

import { IsOptional, IsString, IsNumber, IsArray, IsUrl, IsDateString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class EndpointDto { @IsString() path:string; @IsString() method:string; @IsOptional() @IsString() description?:string; }

export class ApiReferenceDto { @IsOptional() @IsString() version?:string; @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => EndpointDto) endpoints?:EndpointDto[]; }

export class SdkDto { @IsString() language:string; @IsOptional() @IsString() packageName?:string; @IsOptional() @IsString() version?:string; }

export class DeveloperGuideDto { @IsOptional() @IsString() content?:string; @IsOptional() @IsUrl() url?:string; }

export class UserGuideDto { @IsOptional() @IsString() content?:string; @IsOptional() @IsUrl() url?:string; }

export class DocumentationDto { @IsOptional() @ValidateNested() @Type(() => UserGuideDto) userGuide?:UserGuideDto; @IsOptional() @ValidateNested() @Type(() => DeveloperGuideDto) developerGuide?:DeveloperGuideDto; @IsOptional() @ValidateNested() @Type(() => ApiReferenceDto) apiReference?:ApiReferenceDto; @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => SdkDto) sdks?:SdkDto[]; }

export class FaqDto { @IsString() id:string; @IsString() question:string; @IsString() answer:string; @IsOptional() @IsString() category?:string; }

export class TutorialStepDto { @IsString() id:string; @IsString() title:string; @IsString() content:string; @IsOptional() @IsNumber() duration?:number; }

export class TutorialDto { @IsString() id:string; @IsString() title:string; @IsOptional() @IsString() description?:string; @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => TutorialStepDto) steps?:TutorialStepDto[]; @IsOptional() @IsNumber() estimatedTime?:number; @IsOptional() @IsString() difficulty?:'beginner'|'intermediate'|'advanced'; }

export class ChangeDto { @IsString() type:'added'|'changed'|'fixed'|'removed'|'security'|'deprecated'; @IsString() content:string; }

export class ChangelogDto { @IsString() id:string; @IsString() version:string; @IsString() date:string; @IsString() title:string; @IsOptional() @IsString() description?:string; @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => ChangeDto) changes?:ChangeDto[]; }

export class SupportChannelDto { @IsString() type:string; @IsOptional() @IsString() name?:string; @IsOptional() @IsUrl() url?:string; @IsOptional() @IsString() contact?:string; }

export class ForumDto { @IsOptional() @IsString() url?:string; @IsOptional() @IsNumber() members?:number; }

export class ChatDto { @IsOptional() @IsString() provider?:string; @IsOptional() @IsUrl() url?:string; }

export class SocialDto { @IsString() platform:string; @IsOptional() @IsUrl() url?:string; }

export class CommunityDto { @IsOptional() @ValidateNested() @Type(() => ForumDto) forum?:ForumDto; @IsOptional() @ValidateNested() @Type(() => ChatDto) chat?:ChatDto; @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => SocialDto) social?:SocialDto[]; }

export class KnowledgeBaseArticleDto { @IsString() id:string; @IsString() title:string; @IsOptional() @IsString() content?:string; @IsOptional() @IsUrl() url?:string; }

export class SupportDto { @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => SupportChannelDto) channels?:SupportChannelDto[]; @IsOptional() @ValidateNested() @Type(() => CommunityDto) community?:CommunityDto; @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => KnowledgeBaseArticleDto) knowledgeBase?:KnowledgeBaseArticleDto[]; }

export class TimelineDto { @IsString() id:string; @IsDateString() date:string; @IsOptional() @IsString() status?:'pending'|'completed'|'overdue'|'cancelled'; @IsOptional() @IsString() priority?:'low'|'medium'|'high'|'critical'; @IsOptional() @IsString() assignedTo?:string; @IsOptional() @IsArray() @IsString({each:true}) dependencies?:string[]; }
