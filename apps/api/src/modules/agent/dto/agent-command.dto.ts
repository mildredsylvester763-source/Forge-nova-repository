// ============================================================================
// FILE: /apps/api/src/modules/agent/dto/agent-command.dto.ts
// ============================================================================

import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class AgentCommandDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  text: string;
}
