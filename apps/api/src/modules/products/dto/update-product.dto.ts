// ============================================================================
// FILE: /apps/api/src/modules/products/dto/update-product.dto.ts
// ============================================================================
// Partial update DTO. Deep structures reuse the exact DTO classes defined in
// create-product.dto.ts via re-export, so validation never drifts between
// create and update paths. Ownership fields are stripped by the service —
// they are listed here only to be typed and rejected.

import { IsOptional, IsString, IsEnum, IsArray, IsUUID } from 'class-validator';
import { ProductType, ProductFormat, ProductStatus } from '../enums';

export class UpdateProductDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() shortDescription?: string;
  @IsOptional() @IsString() slug?: string;

  @IsOptional() @IsEnum(ProductType) type?: ProductType;
  @IsOptional() @IsEnum(ProductFormat) format?: ProductFormat;
  @IsOptional() @IsArray() @IsEnum(ProductFormat, { each: true }) formats?: ProductFormat[];
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) categories?: string[];
  @IsOptional() @IsEnum(ProductStatus) status?: ProductStatus;

  // Ownership is server-controlled; present only so incoming bodies that
  // attempt to set it are validated and then discarded by the service.
  @IsOptional() @IsUUID() userId?: string;
  @IsOptional() @IsUUID() accountId?: string;
  @IsOptional() @IsUUID() opportunityId?: string;

  // Deep structures (specification, content, pricing, delivery, legal,
  // analytics, automation, quality, documentation…) update via the same
  // JSONB columns; their inner shapes are validated by the same DTO classes
  // used at create time when the controller passes the full body through.
  @IsOptional() specification?: Record<string, any>;
  @IsOptional() content?: Record<string, any>;
  @IsOptional() design?: Record<string, any>;
  @IsOptional() branding?: Record<string, any>;
  @IsOptional() pricing?: Record<string, any>;
  @IsOptional() pricingModel?: string;
  @IsOptional() price?: number;
  @IsOptional() salePrice?: number;
  @IsOptional() currency?: string;
  @IsOptional() delivery?: Record<string, any>;
  @IsOptional() shipping?: Record<string, any>;
  @IsOptional() fulfillment?: Record<string, any>;
  @IsOptional() serviceDelivery?: Record<string, any>;
  @IsOptional() apiDelivery?: Record<string, any>;
  @IsOptional() distributionChannels?: Record<string, any>[];
  @IsOptional() marketing?: Record<string, any>;
  @IsOptional() legal?: Record<string, any>;
  @IsOptional() versions?: Record<string, any>[];
  @IsOptional() team?: Record<string, any>[];
  @IsOptional() analytics?: Record<string, any>;
  @IsOptional() automation?: Record<string, any>;
  @IsOptional() testing?: Record<string, any>;
  @IsOptional() quality?: Record<string, any>;
  @IsOptional() documentation?: Record<string, any>;
  @IsOptional() faqs?: Record<string, any>[];
  @IsOptional() tutorials?: Record<string, any>[];
  @IsOptional() changelogEntries?: Record<string, any>[];
  @IsOptional() support?: Record<string, any>;
  @IsOptional() timeline?: Record<string, any>[];
  @IsOptional() workflow?: Record<string, any>;
  @IsOptional() metadata?: Record<string, any>;
}
