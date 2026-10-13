// ============================================================================
// FILE: /apps/api/src/modules/expenses/dto/create-expense.dto.ts
// ============================================================================

import { IsDateString, IsInt, IsOptional, IsPositive, IsString } from 'class-validator';

export class CreateExpenseDto {
  @IsString()
  description: string;

  @IsInt()
  @IsPositive()
  amountCents: number;

  @IsDateString()
  incurredAt: string;

  @IsOptional()
  @IsString()
  vendorName?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
