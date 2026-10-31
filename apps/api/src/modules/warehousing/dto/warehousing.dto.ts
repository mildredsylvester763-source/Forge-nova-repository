import { IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class CreateLocationDto {
  @IsString()
  @MinLength(1)
  name: string;
}

export class ReceiveStockDto {
  @IsString()
  @MinLength(1)
  locationId: string;

  @IsString()
  @MinLength(1)
  sku: string;

  @IsInt()
  @Min(1)
  @Max(1000000)
  qty: number;
}

export class TransferStockDto {
  @IsString()
  @MinLength(1)
  fromLocationId: string;

  @IsString()
  @MinLength(1)
  toLocationId: string;

  @IsString()
  @MinLength(1)
  sku: string;

  @IsInt()
  @Min(1)
  @Max(1000000)
  qty: number;
}

export class ReceiveBatchDto {
  @IsString()
  @MinLength(1)
  locationId: string;

  @IsString()
  @MinLength(1)
  sku: string;

  @IsString()
  @MinLength(1)
  batchCode: string;

  @IsInt()
  @Min(1)
  @Max(1000000)
  qty: number;

  @IsInt()
  @Min(0)
  @Max(4102444800000)
  expiresAtMs: number;
}

export class PickBatchDto {
  @IsString()
  @MinLength(1)
  sku: string;

  @IsInt()
  @Min(1)
  @Max(1000000)
  qty: number;
}

export class DisposeBatchDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  sku?: string;
}
