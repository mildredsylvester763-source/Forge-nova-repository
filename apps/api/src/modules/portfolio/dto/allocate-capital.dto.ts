import { IsNumber, IsOptional, Min, Max } from 'class-validator';

export class AllocateCapitalDto {
  // Total budget to distribute across SCALE/PIVOT candidates this cycle.
  @IsNumber()
  @Min(0)
  budget: number;

  // Ceiling on any single candidate's share of the budget. Default 40%.
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @Max(1)
  maxSharePerCandidate?: number;
}
