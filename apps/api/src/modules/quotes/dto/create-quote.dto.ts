// ============================================================================
// FILE: /apps/api/src/modules/quotes/dto/create-quote.dto.ts
// ============================================================================

import { Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class QuoteLineItemDto {
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

export class CreateQuoteDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  customerName?: string;

  @IsOptional()
  @IsEmail()
  customerEmail?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  currency?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuoteLineItemDto)
  lineItems: QuoteLineItemDto[];

  /** Percent, not basis points: 10 means 10%. Stored as 1000 bp. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  taxRatePercent?: number;

  /** How many days the quote stays valid once sent. Default 30. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  validDays?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
