import { IsInt, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class SetCreditLimitDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  customerRef: string;

  @IsInt()
  @Min(0)
  limitCents: number;
}

export class CreditChargeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  customerRef: string;

  @IsInt()
  @Min(1)
  chargeCents: number;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  reason: string;
}

export class CreditReleaseDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  customerRef: string;

  @IsInt()
  @Min(1)
  releaseCents: number;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  reason: string;
}
