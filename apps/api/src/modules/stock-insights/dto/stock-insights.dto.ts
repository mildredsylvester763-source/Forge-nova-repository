// ============================================================================
// FILE: /apps/api/src/modules/stock-insights/dto/stock-insights.dto.ts
// ============================================================================

import { IsInt, IsString, Max, Min, MinLength } from 'class-validator';

export class RecordCostReceiptDto {
  @IsString()
  @MinLength(1)
  itemId: string;

  @IsInt()
  @Min(1)
  @Max(10000000)
  qty: number;

  @IsInt()
  @Min(1)
  @Max(100000000)
  unitCostCents: number;
}

export class SetSellPriceDto {
  @IsString()
  @MinLength(1)
  itemId: string;

  @IsInt()
  @Min(1)
  @Max(100000000)
  sellPriceCents: number;
}
