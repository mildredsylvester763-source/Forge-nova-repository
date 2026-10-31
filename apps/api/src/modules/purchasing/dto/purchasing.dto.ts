import { ArrayMinSize, IsArray, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class CreateSupplierDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  leadTimeDays?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class PoLineDto {
  @IsString()
  @MinLength(1)
  sku: string;

  @IsInt()
  @Min(1)
  qty: number;

  @IsInt()
  @Min(0)
  unitCostCents: number;
}

export class CreatePurchaseOrderDto {
  @IsString()
  @MinLength(1)
  supplierId: string;

  @IsArray()
  @ArrayMinSize(1)
  lines: PoLineDto[];
}

export class ReceivePoLineDto {
  @IsString()
  @MinLength(1)
  sku: string;

  @IsInt()
  @Min(1)
  qty: number;
}
