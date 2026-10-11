// ============================================================================
// FILE: /apps/api/src/modules/dunning-letters/dto/compose-letter.dto.ts
// ============================================================================

import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ComposeLetterDto {
  @IsOptional() @IsString() @MaxLength(120) businessName?: string;

  @IsOptional() @IsString() @MaxLength(120) senderName?: string;
}
