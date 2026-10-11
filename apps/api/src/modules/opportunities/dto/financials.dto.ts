
import {
  IsOptional,
  IsNumber,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class FinancialProjectionsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => RevenueDto)
  revenue?: RevenueDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CostsDto)
  costs?: CostsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ProfitDto)
  profit?: ProfitDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => BreakEvenDto)
  breakEven?: BreakEvenDto;

  @IsOptional()
  @IsNumber()
  roi?: number;
}

// DTO 18: RevenueDto

export class RevenueDto {
  @IsOptional()
  @IsNumber()
  year1?: number;

  @IsOptional()
  @IsNumber()
  year2?: number;

  @IsOptional()
  @IsNumber()
  year3?: number;

  @IsOptional()
  @IsNumber()
  growthRate?: number;
}

// DTO 19: CostsDto

export class CostsDto {
  @IsOptional()
  @IsNumber()
  startup?: number;

  @IsOptional()
  @IsNumber()
  monthly?: number;

  @IsOptional()
  @IsNumber()
  variablePerUnit?: number;
}

// DTO 20: ProfitDto

export class ProfitDto {
  @IsOptional()
  @IsNumber()
  year1?: number;

  @IsOptional()
  @IsNumber()
  year2?: number;

  @IsOptional()
  @IsNumber()
  year3?: number;

  @IsOptional()
  @IsNumber()
  margin?: number;
}

// DTO 21: BreakEvenDto

export class BreakEvenDto {
  @IsOptional()
  @IsNumber()
  units?: number;

  @IsOptional()
  @IsNumber()
  months?: number;
}

// DTO 22: RequiredResourcesDto
