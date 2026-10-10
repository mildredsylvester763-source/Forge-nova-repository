// ============================================================================
// FILE: /apps/api/src/modules/invoices/dto/create-invoice.dto.ts
// ============================================================================

import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUuid,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class LineItemDto {
  @IsString()
  @IsNotEmpty()
  description: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  quantity: number;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  unitPrice: number;
}

export class CreateInvoiceDto {
  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsEmail()
  customerEmail?: string;

  @IsOptional()
  @IsUuid()
  productId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  currency?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LineItemDto)
  lineItems: LineItemDto[];

  /** Percent, not basis points: 10 means 10%. Stored as 1000 bp. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  taxRatePercent?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  netDays?: number;

  @IsOptional()
  @IsDateString()
  issueDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
