// ============================================================================
// FILE: /apps/api/src/modules/crm-activities/dto/activity.dto.ts
// ============================================================================

import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateActivityDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  kind?: string;

  @IsOptional()
  @IsUUID()
  contactId?: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  valueCents?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
