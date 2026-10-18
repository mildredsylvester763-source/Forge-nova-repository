import { IsInt, IsString, Min, MinLength } from 'class-validator';

export class ApplyReferralDto {
  @IsString()
  @MinLength(4)
  code: string;
}

export class RewardReferralDto {
  @IsString()
  @MinLength(1)
  refereeId: string;

  @IsInt()
  @Min(1)
  purchaseCents: number;
}
