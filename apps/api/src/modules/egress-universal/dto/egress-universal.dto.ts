// ============================================================================
// FILE: /apps/api/src/modules/egress-universal/dto/egress-universal.dto.ts
// ============================================================================

import { IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class ConnectDestinationDto {
  @IsString()
  @MaxLength(64)
  destinationId: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  @IsObject()
  credentials: Record<string, string>;
}

export class DispatchEgressDto {
  @IsString()
  @MaxLength(64)
  connectionId: string;

  @IsIn(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'])
  method: string;

  @IsString()
  @MaxLength(1024)
  path: string;

  @IsOptional()
  @IsObject()
  body?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  headers?: Record<string, string>;
}
