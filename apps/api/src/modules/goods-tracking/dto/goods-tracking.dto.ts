// ============================================================================
// FILE: /apps/api/src/modules/goods-tracking/dto/goods-tracking.dto.ts
// ============================================================================

import { IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class RecordDamageDto {
  @IsString()
  @MinLength(1)
  itemId: string;

  @IsInt()
  @Min(1)
  @Max(1000000)
  qty: number;

  @IsString()
  @MinLength(1)
  reason: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  note?: string;
}

export class CreateConsignorDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsInt()
  @Min(0)
  @Max(100)
  defaultCommissionPct: number;
}

export class ReceiveConsignmentDto {
  @IsString()
  @MinLength(1)
  consignorId: string;

  @IsString()
  @MinLength(1)
  sku: string;

  @IsInt()
  @Min(1)
  @Max(1000000)
  qty: number;
}

export class ConsignmentSaleDto {
  @IsString()
  @MinLength(1)
  consignorId: string;

  @IsString()
  @MinLength(1)
  sku: string;

  @IsInt()
  @Min(1)
  @Max(1000000)
  qty: number;

  @IsInt()
  @Min(1)
  @Max(100000000)
  unitPriceCents: number;
}

export class ConsignmentReturnDto {
  @IsString()
  @MinLength(1)
  consignorId: string;

  @IsString()
  @MinLength(1)
  sku: string;

  @IsInt()
  @Min(1)
  @Max(1000000)
  qty: number;
}
