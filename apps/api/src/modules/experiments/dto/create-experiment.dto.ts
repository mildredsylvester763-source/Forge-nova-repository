import { IsString, IsNotEmpty, MaxLength, IsOptional, IsUUID, IsNumber, Min, Max, IsIn } from 'class-validator';

export class CreateExperimentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsString()
  @IsNotEmpty()
  hypothesis: string;

  @IsOptional()
  @IsString()
  learningGoal?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  successMetric: string;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @Max(1)
  successThreshold: number;

  @IsOptional()
  @IsUUID()
  opportunityId?: string;

  @IsOptional()
  @IsUUID()
  productId?: string;
}

export class RecordObservationDto {
  @IsIn(['baseline', 'variant'])
  arm: 'baseline' | 'variant';

  @IsNumber()
  @Min(0)
  visitors: number;

  @IsNumber()
  @Min(0)
  conversions: number;
}
