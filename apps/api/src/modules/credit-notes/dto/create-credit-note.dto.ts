// ============================================================================
// FILE: /apps/api/src/modules/credit-notes/dto/create-credit-note.dto.ts
// ============================================================================

import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateCreditNoteDto {
  /** Face value in cents. Money is always integer cents, never floats. */
  @IsInt()
  @Min(1)
  amountCents: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}
