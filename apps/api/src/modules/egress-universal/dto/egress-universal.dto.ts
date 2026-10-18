// ============================================================================
// FILE: /apps/api/src/modules/egress-universal/dto/egress-universal.dto.ts
// ============================================================================

import { ArrayMaxSize, IsArray, IsIn, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

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

// The per-connection operational contract. Every field is optional; the
// engine defaults apply wherever a field is absent.
export class UpdateConnectionPolicyDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4)
  maxAttempts?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000000)
  monthlyCallCap?: number;
}

// Connection metadata: tags and notes. Tags are validated and normalized by
// the connection-meta engine (lowercase, deduplicated, bounded); the engine
// refuses malformed input by name.
export class UpdateConnectionMetaDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  tags?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

// Credential rotation: replaces the sealed envelope with new credentials.
// The engine re-validates them against the destination contract and
// reseals; health resets to unknown until the next probe proves otherwise.
export class RotateCredentialsDto {
  @IsObject()
  credentials: Record<string, string>;
}
