// ============================================================================
// FILE: apps/api/src/modules/products/dto/automation.dto.ts
// ============================================================================

import { IsOptional, IsString, IsNumber, IsArray, IsBoolean, IsDateString, ValidateNested, IsJSON } from 'class-validator';
import { Type } from 'class-transformer';

export class AiAgentPerformanceDto { @IsOptional() @IsNumber() tasksCompleted?:number; @IsOptional() @IsNumber() successRate?:number; @IsOptional() @IsNumber() averageLatency?:number; @IsOptional() @IsNumber() cost?:number; }

export class AiAgentDto { @IsString() id:string; @IsString() name:string; @IsOptional() @IsString() purpose?:string; @IsOptional() @IsBoolean() enabled?:boolean; @IsOptional() @ValidateNested() @Type(() => AiAgentPerformanceDto) performance?:AiAgentPerformanceDto; }

export class AiAutomationDto { @IsOptional() @IsBoolean() enabled?:boolean; @IsOptional() @IsArray() @IsString({each:true}) triggers?:string[]; @IsOptional() @IsArray() @IsString({each:true}) actions?:string[]; }

export class AutomationDto { @IsBoolean() enabled:boolean; @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => WorkflowDto) workflows?:WorkflowDto[]; @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => AiAgentDto) aiAgents?:AiAgentDto[]; @IsOptional() @ValidateNested() @Type(() => AiAutomationDto) aiAutomation?:AiAutomationDto; }

export class TriggerDto { @IsString() type:'manual'|'scheduled'|'event-based'|'webhook'; @IsOptional() @IsString() event?:string; @IsOptional() @IsString() schedule?:string; }

export class ActionDto { @IsString() id:string; @IsString() type:'create'|'update'|'delete'|'notify'|'integrate'|'custom'; @IsOptional() @IsString() service?:string; @IsOptional() @IsJSON() configuration?:any; @IsOptional() @IsNumber() order?:number; }

export class ConditionDto { @IsString() field:string; @IsString() operator:'=='|'!='|'>'|'<'|'>='|'<='|'contains'|'in'; @IsJSON() value:any; }

export class WorkflowDto { @IsString() id:string; @IsString() name:string; @IsOptional() @IsString() description?:string; @IsOptional() @ValidateNested() @Type(() => TriggerDto) trigger?:TriggerDto; @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => ActionDto) actions?:ActionDto[]; @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(() => ConditionDto) conditions?:ConditionDto[]; @IsBoolean() enabled:boolean; @IsOptional() @IsDateString() lastRun?:string; @IsOptional() @IsDateString() nextRun?:string; @IsOptional() @IsNumber() runCount?:number; @IsOptional() @IsString() status?:'idle'|'running'|'paused'|'failed'; }

export class ProductGenerationDto { @IsOptional() @IsString() model?:string; @IsOptional() @IsString() prompt?:string; @IsOptional() @IsNumber() confidence?:number; @IsOptional() @IsNumber() iterations?:number; }

export class ContentGenerationDto { @IsOptional() @IsBoolean() enabled?:boolean; @IsOptional() @IsString() model?:string; @IsOptional() @IsArray() @IsString({each:true}) outputs?:string[]; }

export class MarketingAutomationDto { @IsOptional() @IsBoolean() enabled?:boolean; @IsOptional() @IsArray() @IsString({each:true}) campaigns?:string[]; }

export class CustomerSupportDto { @IsOptional() @IsBoolean() enabled?:boolean; @IsOptional() @IsArray() @IsString({each:true}) channels?:string[]; @IsOptional() @IsString() responsePolicy?:string; }
