// ============================================================================
// FILE: apps/api/src/modules/products/dto/delivery.dto.ts
// ============================================================================

import { IsOptional, IsString, IsNumber, IsArray, IsBoolean, IsUrl, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentOptionDto } from './pricing.dto';

export class DownloadDeliveryDto { @IsOptional() @IsUrl() url?:string; @IsOptional() @IsNumber() expiresIn?:number; @IsOptional() @IsNumber() maxDownloads?:number; }

export class PhysicalDeliveryDto { @IsOptional() @IsString() address?:string; @IsOptional() @IsString() carrier?:string; @IsOptional() @IsString() trackingNumber?:string; }

export class DeliveryDto { @IsOptional() @ValidateNested() @Type(() => DownloadDeliveryDto) download?:DownloadDeliveryDto; @IsOptional() @ValidateNested() @Type(() => PhysicalDeliveryDto) physical?:PhysicalDeliveryDto; @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => PaymentOptionDto) paymentOptions?:PaymentOptionDto[]; }

export class ShippingDto { @IsBoolean() enabled:boolean; @IsOptional() @IsArray() @IsString({each:true}) providers?:string[]; @IsOptional() @IsArray() @IsString({each:true}) countries?:string[]; @IsOptional() @IsNumber() shippingCost?:number; @IsOptional() @IsString() handlingTime?:string; @IsOptional() @IsBoolean() tracking?:boolean; }

export class FulfillmentDto { @IsString() type:'self'|'dropshipping'|'print-on-demand'|'third-party'; @IsOptional() @IsString() provider?:string; @IsOptional() @IsString() location?:string; }

export class ServiceDeliveryDto { @IsString() type:'consultation'|'coaching'|'development'|'design'|'other'; @IsOptional() @IsNumber() duration?:number; @IsOptional() @IsString() format?:'video-call'|'in-person'|'email'|'chat'|'asynchronous'; @IsOptional() @ValidateNested() @Type(() => SchedulingDto) scheduling?:SchedulingDto; }

export class SchedulingDto { @IsBoolean() enabled:boolean; @IsOptional() @IsUrl() calendarUrl?:string; @IsOptional() @IsString() availability?:string; }

export class ApiDeliveryDto { @IsOptional() @IsString() endpoint?:string; @IsOptional() @IsUrl() documentationUrl?:string; @IsOptional() @IsNumber() rateLimit?:number; @IsOptional() @IsString() authentication?:'none'|'api-key'|'oauth'|'jwt'; }

export class IntegrationDto { @IsString() type:'api'|'webhook'|'manual'|'zapier'; @IsBoolean() configured:boolean; @IsOptional() @IsString() lastSync?:string; }

export class DistributionChannelDto { @IsString() id:string; @IsString() type:'own-website'|'marketplace'|'social-media'|'email'|'affiliate'|'wholesale'|'retail'; @IsString() name:string; @IsOptional() @IsUrl() url?:string; @IsBoolean() enabled:boolean; @IsOptional() @IsNumber() commission?:number; @IsOptional() @IsNumber() fees?:number; @IsOptional() @IsNumber() reach?:number; @IsOptional() @ValidateNested() @Type(() => IntegrationDto) integration?:IntegrationDto; }
