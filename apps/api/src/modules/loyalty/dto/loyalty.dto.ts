import { IsInt, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class EarnPointsDto {
  @IsInt()
  @Min(100)
  @Max(10000000)
  amountCents: number;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  reason: string;
}

export class RedeemPointsDto {
  @IsInt()
  @Min(1)
  @Max(1000000)
  points: number;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  reason: string;
}
