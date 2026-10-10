// ============================================================================
// FILE: /apps/api/src/modules/payment-links/dto/create-payment-link.dto.ts
// ============================================================================

import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreatePaymentLinkDto {
  /** When set, the link pays this invoice and its amount locks to the invoice total. */
  @IsOptional()
  @IsUUID()
  invoiceId?: string;

  /** Standalone amount in cents (ignored when invoiceId is given). */
  @IsOptional()
  @IsInt()
  @Min(1)
  amountCents?: number;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;

  @IsOptional()
  @IsBoolean()
  singleUse?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  maxUses?: number;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
