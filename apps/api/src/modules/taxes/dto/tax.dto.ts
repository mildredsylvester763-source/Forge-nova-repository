// ============================================================================
// FILE: /apps/api/src/modules/taxes/dto/tax.dto.ts
// ============================================================================

import { IsIn, IsInt, IsNotEmpty, IsString, MaxLength, Min } from 'class-validator';

export class VatDto {
  @IsInt()
  @Min(0)
  amountCents: number;

  /** Basis points: 750 = 7.5%. */
  @IsInt()
  @Min(0)
  rateBps: number;

  @IsIn(['exclusive', 'inclusive'])
  mode: 'exclusive' | 'inclusive';
}

export class WithholdingDto {
  @IsInt()
  @Min(0)
  grossCents: number;

  @IsNotEmpty()
  @IsString()
  @MaxLength(40)
  kind: string;
}

export class FilingDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(40)
  periodLabel: string;

  @IsInt()
  @Min(0)
  outputVatCents: number;

  @IsInt()
  @Min(0)
  inputVatCents: number;
}
