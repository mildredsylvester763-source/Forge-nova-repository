// ============================================================================
// FILE: /apps/api/src/modules/products/dto/product-query.dto.ts
// ============================================================================
// List/filter parameters. Carries the single-value filters, array filters,
// and price/revenue ranges that findAll() reads. Pagination uses skip/take.

import { IsOptional, IsEnum, IsString, IsInt, IsArray, IsNumber, Min, Max, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';
import { ProductType, ProductFormat, ProductStatus } from '../enums';

export class ProductQueryDto {
  @IsOptional() @IsEnum(ProductType) type?: ProductType;
  @IsOptional() @IsEnum(ProductFormat) format?: ProductFormat;
  @IsOptional() @IsEnum(ProductStatus) status?: ProductStatus;
  @IsOptional() @IsString() pricingModel?: string;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsUUID() opportunityId?: string;

  @IsOptional() @IsArray() @IsEnum(ProductType, { each: true }) types?: ProductType[];
  @IsOptional() @IsArray() @IsEnum(ProductStatus, { each: true }) statuses?: ProductStatus[];

  @IsOptional() @IsString() search?: string;

  @IsOptional() @Type(() => Number) @IsNumber() minPrice?: number;
  @IsOptional() @Type(() => Number) @IsNumber() maxPrice?: number;
  @IsOptional() @Type(() => Number) @IsNumber() minRevenue?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) skip?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) take?: number;
}
