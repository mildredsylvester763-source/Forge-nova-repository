// ============================================================================
// FILE: /apps/api/src/modules/integrations/mcp.service.ts
// ============================================================================
// The MCP surface: a pinned registry of business tools an MCP client can
// call with an API key. Validation lives in the engine; execution routes
// to the domain services that already exist — one business, one truth.

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { listTools, resolveTool, validateToolArgs } from './engine/mcp-tools';
import { draftInvoiceFromText } from '../agent/engine/invoice-draft';
import { computeVat } from '../taxes/engine/tax-compute';
import { AgentService } from '../agent/agent.service';
import { ActivitiesService } from '../crm-activities/activities.service';
import { InventoryService } from '../inventory/inventory.service';

@Injectable()
export class McpService {
  constructor(
    private readonly agentService: AgentService,
    private readonly activitiesService: ActivitiesService,
    private readonly inventoryService: InventoryService,
  ) {}

  list() {
    return { tools: listTools() };
  }

  async call(userId: string, toolName: string, args: Record<string, unknown>) {
    const tool = resolveTool(toolName);
    if (!tool.ok) {
      throw new NotFoundException(tool.reason);
    }
    const validated = validateToolArgs(toolName, args ?? {});
    if (!validated.ok) {
      throw new BadRequestException(validated.reason);
    }
    const a = validated.value;
    switch (tool.value.name) {
      case 'draft_invoice': {
        const draft = draftInvoiceFromText(String(a.text));
        if (!draft.ok) {
          throw new BadRequestException(draft.reason);
        }
        return { tool: tool.value.name, result: draft.value };
      }
      case 'weekly_report':
        return { tool: tool.value.name, result: await this.agentService.weeklyReportFor(userId) };
      case 'cashflow_forecast':
        return {
          tool: tool.value.name,
          result: await this.agentService.cashflowForecastFor(
            userId,
            typeof a.days === 'number' ? a.days : 90,
          ),
        };
      case 'search':
        return { tool: tool.value.name, result: await this.agentService.search(userId, String(a.query)) };
      case 'compute_vat': {
        const vat = computeVat(
          Number(a.amountCents),
          Number(a.rateBps),
          a.mode === 'inclusive' ? 'inclusive' : 'exclusive',
        );
        if (!vat.ok) {
          throw new BadRequestException(vat.reason);
        }
        return { tool: tool.value.name, result: vat.value };
      }
      case 'next_actions':
        return { tool: tool.value.name, result: await this.activitiesService.nextActions(userId) };
      case 'reorder_plan':
        return {
          tool: tool.value.name,
          result: await this.inventoryService.reorderPlanFor(userId, String(a.itemId)),
        };
      default:
        throw new NotFoundException('mcp-unknown-tool:' + toolName);
    }
  }
}
