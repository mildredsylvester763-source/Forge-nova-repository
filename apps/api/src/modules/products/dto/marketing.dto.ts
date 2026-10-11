// ============================================================================
// FILE: apps/api/src/modules/products/dto/marketing.dto.ts
// ============================================================================

import { IsOptional, IsString, IsNumber, IsArray, IsBoolean, IsUrl, IsDateString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class MarketingDto { @IsOptional() @ValidateNested() @Type(() => SeoDto) seo?:SeoDto; @IsOptional() @ValidateNested() @Type(() => ContentMarketingDto) content?:ContentMarketingDto; @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => SocialPostDto) socialPosts?:SocialPostDto[]; @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => AdDto) ads?:AdDto[]; }

export class SeoDto { @IsOptional() @IsString() title?:string; @IsOptional() @IsString() description?:string; @IsOptional() @IsArray() @IsString({each:true}) keywords?:string[]; @IsOptional() @IsString() canonicalUrl?:string; }

export class ContentMarketingDto { @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => BlogPostDto) blogPosts?:BlogPostDto[]; @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => VideoDto) videos?:VideoDto[]; }

export class BlogPostDto { @IsString() id:string; @IsString() title:string; @IsOptional() @IsString() content?:string; @IsOptional() @IsUrl() url?:string; @IsOptional() @IsDateString() publishedAt?:string; }

export class SocialPostDto { @IsString() id:string; @IsString() platform:string; @IsString() content:string; @IsOptional() @IsUrl() url?:string; @IsOptional() @IsBoolean() published?:boolean; @IsOptional() @IsDateString() publishedAt?:string; @IsOptional() @ValidateNested() @Type(() => EngagementDto) engagement?:EngagementDto; }

export class EngagementDto { @IsOptional() @IsNumber() likes?:number; @IsOptional() @IsNumber() shares?:number; @IsOptional() @IsNumber() comments?:number; }

export class VideoDto { @IsString() id:string; @IsString() title:string; @IsOptional() @IsUrl() url?:string; @IsOptional() @IsString() platform?:string; @IsOptional() @IsBoolean() published?:boolean; @IsOptional() @IsDateString() publishedAt?:string; @IsOptional() @IsNumber() views?:number; }

export class EmailDto { @IsString() id:string; @IsString() subject:string; @IsOptional() @IsString() preview?:string; @IsOptional() @IsBoolean() sent?:boolean; @IsOptional() @IsDateString() sentAt?:string; @IsOptional() @IsNumber() openRate?:number; @IsOptional() @IsNumber() clickRate?:number; }

export class AdDto { @IsString() id:string; @IsString() platform:string; @IsString() campaign:string; @IsNumber() budget:number; @IsOptional() @IsNumber() spent?:number; @IsOptional() @IsNumber() clicks?:number; @IsOptional() @IsNumber() impressions?:number; @IsOptional() @IsNumber() conversions?:number; @IsOptional() @IsNumber() ctr?:number; @IsOptional() @IsNumber() cpc?:number; @IsOptional() @IsNumber() roi?:number; }

export class AffiliateDto { @IsString() id:string; @IsString() name:string; @IsNumber() commission:number; @IsOptional() @IsNumber() sales?:number; @IsOptional() @IsNumber() revenue?:number; @IsOptional() @IsString() status?:'active'|'inactive'|'pending'; }
