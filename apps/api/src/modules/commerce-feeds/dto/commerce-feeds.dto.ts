import {
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class SaveListingDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  itemId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(150)
  title: string;

  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  description: string;

  @IsString()
  @MinLength(8)
  @MaxLength(2048)
  imageUrl: string;

  @IsString()
  @MinLength(8)
  @MaxLength(2048)
  productUrl: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  brand?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  availability?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  condition?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(14)
  gtin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  mpn?: string;
}

export class PlanShopSyncDto {
  @IsString()
  @MaxLength(20)
  channel: string;

  @IsString()
  @MinLength(1)
  variantId: string;
}
