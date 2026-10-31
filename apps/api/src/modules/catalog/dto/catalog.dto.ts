import { ArrayMinSize, IsArray, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class CatalogOptionDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsArray()
  @ArrayMinSize(2)
  values: string[];
}

export class CreateCatalogItemDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsArray()
  options?: CatalogOptionDto[];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999999999)
  unitPriceCents?: number;
}

export class AssignBarcodeDto {
  @IsString()
  @MinLength(1)
  barcode: string;
}
