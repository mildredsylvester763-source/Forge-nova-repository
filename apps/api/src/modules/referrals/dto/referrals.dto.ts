import { IsInt, IsString, IsUuid, Min, MinLength } from 'class-validator';

export class ApplyReferralDto {
  @IsString()
  @MinLength(4)
  code: string;
}

export class RewardReferralDto {
  @IsUuid()
  refereeId: string;

  @IsInt()
  @Min(1)
  purchaseCents: number;
}
