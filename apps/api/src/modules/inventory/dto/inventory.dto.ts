// ============================================================================
// FILE: /apps/api/src/modules/inventory/dto/inventory.dto.ts
// ============================================================================

import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateStockItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  sku: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  dailyDemand?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  leadTimeDays?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  safetyStock?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  unitCostCents?: number;
}

export class StockMovementDto {
  @IsInt()
  qty: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
