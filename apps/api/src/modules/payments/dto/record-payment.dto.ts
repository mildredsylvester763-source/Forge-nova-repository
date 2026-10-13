// ============================================================================
// FILE: /apps/api/src/modules/payments/dto/record-payment.dto.ts
// ============================================================================

import { IsDateString, IsInt, IsOptional, IsPositive, IsString } from 'class-validator';

export class RecordPaymentDto {
  /** Integer cents. Never floating point. */
  @IsInt()
  @IsPositive()
  amountCents: number;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsString()
  method?: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsDateString()
  receivedAt?: string;
}
