// ============================================================================
// FILE: /apps/api/src/modules/integrations/mcp.controller.ts
// ============================================================================
// The MCP endpoint. It is public to the global auth guard and protected by
// the API key guard instead: a valid fn_live_ key with the mcp scope IS
// the user. Identity always comes from the key row, never the body.

import { Body, Controller, HttpCode, Post, Request, UseGuards } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { ApiKeyGuard } from './guards/api-key.guard';
import { McpService } from './mcp.service';
import { CallMcpDto } from './dto/integrations.dto';

@Public()
@UseGuards(ApiKeyGuard)
@Controller('integrations/mcp')
export class McpController {
  constructor(private readonly mcpService: McpService) {}

  @Post()
  @HttpCode(200)
  async handle(@Request() req: any, @Body() dto: CallMcpDto) {
    if (dto.method === 'list-tools') {
      return this.mcpService.list();
    }
    return this.mcpService.call(req.user.id, dto.tool, dto.args ?? {});
  }
}
