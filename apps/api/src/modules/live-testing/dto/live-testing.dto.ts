import {
  IsArray,
  IsBoolean,
  IsInt,
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
