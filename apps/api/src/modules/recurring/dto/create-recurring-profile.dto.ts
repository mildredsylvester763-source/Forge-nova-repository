// ============================================================================
// FILE: /apps/api/src/modules/recurring/dto/create-recurring-profile.dto.ts
// ============================================================================

import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { RecurringFrequency } from '../entities/recurring-invoice-profile.entity';

class TemplateLineItemDto {
  @IsString()
  @IsNotEmpty()
  description: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  quantity: number;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  unitPrice: number;
}

class RecurringTemplateDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  customerName?: string;

  @IsOptional()
  @IsEmail()
  customerEmail?: string;

  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  currency?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TemplateLineItemDto)
  lineItems: TemplateLineItemDto[];

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  taxRatePercent?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  netDays?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class CreateRecurringProfileDto {
  @IsIn(['weekly', 'monthly', 'quarterly'] as RecurringFrequency[])
  frequency: RecurringFrequency;

  /** Validated against the frequency by the engine's validateAnchor. */
  @IsInt()
  @Min(0)
  @Max(31)
  anchorDay: number;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ValidateNested()
  @Type(() => RecurringTemplateDto)
  template: RecurringTemplateDto;
}
