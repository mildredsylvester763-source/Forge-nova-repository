// ============================================================================
// FILE: /apps/api/src/modules/accounting/dto/create-journal.dto.ts
// ============================================================================

import { IsDateString, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { IsIn, IsInt, IsOptional, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray } from 'class-validator';

export class JournalLineDto {
  @IsUUID()
  accountId: string;

  @IsIn(['debit', 'credit'])
  side: 'debit' | 'credit';

  @IsInt()
  @Min(1)
  amountCents: number;
}

export class CreateJournalDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  description: string;

  @IsOptional()
  @IsUUID()
  sourceId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  idempotencyKey: string;

  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => JournalLineDto)
  lines: JournalLineDto[];

  @IsOptional()
  @IsDateString()
  occurredAt?: string;
}
