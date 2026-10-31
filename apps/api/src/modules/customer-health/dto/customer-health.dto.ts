import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class RecordNpsResponseDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  customerRef: string;

  @IsInt()
  @Min(0)
  @Max(10)
  score: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(10)
  channel: string;
}

export class AssessChurnDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  customerRef: string;

  @IsInt()
  @Min(0)
  daysSinceLastInteraction: number;

  @IsInt()
  @Min(0)
  overdueInvoiceCount: number;

  @IsInt()
  @Min(0)
  maxDaysOverdue: number;

  @IsInt()
  @Min(-100)
  @Max(100)
  spendTrendPercent: number;
}
