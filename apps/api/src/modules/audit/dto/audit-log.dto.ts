// ============================================================================
// FILE: /apps/api/src/modules/audit/dto/audit-log.dto.ts
// ============================================================================

import { IsNotEmpty, IsObject, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class RecordAuditDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  entity: string;

  @IsUUID()
  entityId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  action: string;

  @IsObject()
  before: Record<string, unknown>;

  @IsObject()
  after: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
