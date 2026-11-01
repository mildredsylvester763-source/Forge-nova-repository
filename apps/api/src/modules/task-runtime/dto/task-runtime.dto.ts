// DTOs for the task runtime module (FORGE AI-079..083). Wire shapes only:
// the pure engines accept unknown-shaped input and validate everything
// themselves with named refusals, so these classes exist for the global
// validation pipe, not for engine logic.

import { Type } from 'class-transformer';
import {
  Allow,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class StepCheckDto {
  @IsString()
  @IsNotEmpty()
  type: string;

  @IsOptional()
  @IsString()
  path?: string;

  @IsOptional()
  @IsInt()
  limit?: number;

  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @Allow()
  value?: unknown;
}

export class StepValidateDto {
  @IsString()
  @IsNotEmpty()
  stepId: string;

  @IsOptional()
  @Allow()
  output?: unknown;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StepCheckDto)
  checks: StepCheckDto[];
}

export class ApprovalPolicyDto {
  @IsOptional()
  @IsArray()
  riskLevels?: string[];

  @IsOptional()
  @IsArray()
  toolClasses?: string[];

  @IsOptional()
  @IsNumber()
  maxAutoCost?: number;
}

export class ApprovalPlanDto {
  @IsString()
  @IsNotEmpty()
  risk: string;

  @IsString()
  @IsNotEmpty()
  toolClass: string;

  @IsNumber()
  cost: number;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ApprovalPolicyDto)
  policy?: ApprovalPolicyDto;
}

export class ApprovalResolveDto {
  @IsString()
  @IsNotEmpty()
  gateId: string;

  @IsString()
  @IsNotEmpty()
  decision: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class TaskCommandDto {
  @IsString()
  @IsNotEmpty()
  state: string;

  @IsString()
  @IsNotEmpty()
  command: string;
}

export class TaskCreateDto {
  @IsOptional()
  @IsString()
  goal?: string;
}

export class TaskRecordEventDto {
  @IsString()
  @IsNotEmpty()
  runId: string;

  @IsString()
  @IsNotEmpty()
  type: string;

  @IsOptional()
  @IsString()
  stepId?: string;

  @IsOptional()
  @IsString()
  gateId?: string;
}

export class TaskReplayDto {
  @IsString()
  @IsNotEmpty()
  runId: string;

  @IsOptional()
  @IsInt()
  toSeq?: number;
}

export class ParallelAgentDto {
  @IsString()
  @IsNotEmpty()
  agentId: string;

  @IsOptional()
  @IsArray()
  reads?: string[];

  @IsOptional()
  @IsArray()
  writes?: string[];
}

export class ParallelConflictsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ParallelAgentDto)
  agents: ParallelAgentDto[];

  @IsOptional()
  @IsString()
  mode?: string;
}
