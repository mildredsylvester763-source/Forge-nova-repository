// ============================================================================
// FILE: /apps/api/src/modules/integrations/dto/integrations.dto.ts
// ============================================================================

import { IsArray, IsIn, IsNotEmpty, IsObject, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateApiKeyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsArray()
  @IsIn(['read', 'write', 'mcp', 'webhooks'], { each: true })
  scopes: string[];
}

export class CreateWebhookEndpointDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  url: string;

  @IsString()
  @MinLength(16)
  @MaxLength(200)
  secret: string;

  @IsArray()
  @IsNotEmpty()
  events: string[];
}

export class DispatchEventDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  event: string;

  @IsObject()
  payload: Record<string, unknown>;
}

export class ConnectIntegrationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  connectorId: string;

  @IsObject()
  credentials: Record<string, string>;
}

export class CallMcpDto {
  @IsIn(['list-tools', 'call-tool'])
  method: 'list-tools' | 'call-tool';

  @IsString()
  @MaxLength(60)
  tool: string;

  @IsObject()
  args: Record<string, unknown>;
}
