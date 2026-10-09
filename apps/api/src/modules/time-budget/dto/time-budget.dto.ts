import {
  IsString, IsNotEmpty, MaxLength, IsNumber, IsIn, IsArray, IsOptional,
  IsDateString, Min, Max, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class TimeRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  ref: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  label: string;

  @IsNumber()
  @Min(0.1)
  @Max(168)
  requestedHours: number;

  @IsIn(['critical', 'high', 'normal', 'low'])
  priority: 'critical' | 'high' | 'normal' | 'low';
}

export class UpsertTimeBudgetDto {
  // Monday of the ISO week being planned, as an ISO date string.
  @IsDateString()
  weekStart: string;

  @IsNumber()
  @Min(0.5)
  @Max(168)
  capacityHours: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TimeRequestDto)
  requests: TimeRequestDto[];
}

export class RecordActualDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  ref: string;

  @IsNumber()
  @Min(0.1)
  @Max(168)
  hours: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
