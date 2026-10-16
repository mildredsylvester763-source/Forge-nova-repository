// ============================================================================
// FILE: /apps/api/src/modules/budgets/dto/budget.dto.ts
// ============================================================================

import { IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

export class CreateBudgetDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  category: string;

  /** 'YYYY-MM' */
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'month must be YYYY-MM' })
  month: string;

  @IsInt()
  @Min(0)
  budgetCents: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
