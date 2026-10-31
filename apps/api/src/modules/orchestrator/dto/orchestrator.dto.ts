// DTOs for the orchestrator module (FORGE AI-073..078). Wire shapes only:
// the pure engines accept unknown-shaped input and validate everything
// themselves with named refusals, so these classes exist for the global
// validation pipe, not for engine logic.

import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class IntentClassifyDto {
  @IsString()
  @IsNotEmpty()
  text: string;

  @IsOptional()
  @IsArray()
  allowed?: string[];
}

export class PlanStepInputDto {
  @IsString()
  @IsNotEmpty()
  action: string;

  @IsOptional()
  @IsString()
  detail?: string;
}

export class PlanTaskDto {
  @IsString()
  @IsNotEmpty()
  goal: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlanStepInputDto)
  steps: PlanStepInputDto[];

  @IsOptional()
  @IsString()
  intent?: string;
}

export class PlanInsertStepDto {
  @IsString()
  @IsNotEmpty()
  action: string;

  @IsOptional()
  @IsString()
  detail?: string;
}

export class PlanEditOpDto {
  @IsString()
  @IsIn(['insert', 'remove', 'move'])
  op: string;

  @IsOptional()
  @IsInt()
  index?: number;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => PlanInsertStepDto)
  step?: PlanInsertStepDto;

  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsInt()
  toIndex?: number;
}

export class PlanEditDto {
  @IsString()
  @IsNotEmpty()
  planId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlanEditOpDto)
  edits: PlanEditOpDto[];
}

export class PlanPreviewStepDto {
  @IsString()
  @IsNotEmpty()
  action: string;

  @IsOptional()
  @IsString()
  file?: string;
}

export class PlanPreviewDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlanPreviewStepDto)
  steps: PlanPreviewStepDto[];
}

export class HandoffStepDto {
  @IsString()
  @IsNotEmpty()
  action: string;
}

export class HandoffPlanDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HandoffStepDto)
  steps: HandoffStepDto[];

  @IsOptional()
  @IsArray()
  roster?: string[];
}

export class ToolCheckDto {
  @IsString()
  @IsNotEmpty()
  agent: string;

  @IsString()
  @IsNotEmpty()
  tool: string;
}

export class ToolAssignmentDto {
  @IsString()
  @IsNotEmpty()
  agent: string;

  @IsString()
  @IsNotEmpty()
  action: string;
}

export class ToolPlanDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ToolAssignmentDto)
  assignments: ToolAssignmentDto[];
}

export class SandboxEgressDto {
  @IsString()
  @IsNotEmpty()
  host: string;
}

export class SandboxRunDto {
  @IsString()
  @IsNotEmpty()
  tool: string;

  @IsOptional()
  @IsString()
  command?: string;

  @IsOptional()
  @IsInt()
  timeout?: number;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => SandboxEgressDto)
  egress?: SandboxEgressDto;

  @IsOptional()
  @IsArray()
  egressAllowlist?: string[];

  @IsOptional()
  @IsArray()
  fileWrites?: string[];
}
