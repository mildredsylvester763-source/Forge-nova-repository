import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateSessionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  goal: string;

  @IsString()
  @MinLength(1)
  @MaxLength(16)
  platform: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  persona?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  workspace?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(16)
  environment?: string;

  @IsOptional()
  @IsBoolean()
  safeMode?: boolean;

  @IsOptional()
  @IsObject()
  deviceProfile?: Record<string, unknown>;
}

export class SessionRefDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  sessionId: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  workspace?: string;
}

export class RecordStepDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  sessionId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(32)
  action: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  target?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  value?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  direction?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  key?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  count?: number;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}

export class PostMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  sessionId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body: string;
}

export class ReportFindingDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  sessionId: string;

  @IsInt()
  @Min(1)
  @Max(5)
  severity: number;

  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  reproSteps?: string[];

  @IsOptional()
  @IsObject()
  evidence?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  suspectedCommit?: string;
}

export class CreatePersonaDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  name: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  workspace?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  traits?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  checklist?: string[];

  @IsOptional()
  @IsNumber()
  @Min(0.25)
  @Max(4)
  paceMultiplier?: number;
}

export class PersonaIdDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  personaId: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  workspace?: string;
}

export class SimulateInterruptionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  sessionId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(32)
  scenario: string;
}

export class PermissionGrantDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  permission: string;

  @IsString()
  @MinLength(1)
  @MaxLength(16)
  state: string;
}

export class ApplyPermissionPlanDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  sessionId: string;

  @IsArray()
  grants: PermissionGrantDto[];
}

export class InviteParticipantDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  sessionId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  userId: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(16)
  role?: string;
}

export class ParticipantRefDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  participantId: string;
}

export class HandoffSessionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  sessionId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  device: string;
}

export class GestureStepDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  sessionId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(32)
  gesture: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  contacts?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  pressure?: number;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  direction?: string;

  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(10000)
  durationMs?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  target?: string;
}

export class CreativeOperationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  sessionId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(16)
  editor: string;

  @IsString()
  @MinLength(1)
  @MaxLength(32)
  operation: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  target?: string;
}

export class AvPlaybackDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  sessionId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(16)
  kind: string;

  @IsString()
  @MinLength(1)
  @MaxLength(16)
  codec: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  target?: string;
}

export class AvSyncDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  sessionId: string;

  @IsNumber()
  driftMs: number;
}

export class AvStateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  sessionId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(16)
  from: string;

  @IsString()
  @MinLength(1)
  @MaxLength(16)
  to: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  target?: string;
}

export class SeedAccountsDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  sessionId: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  count?: number;
}
