// ============================================================================
// FILE: /apps/api/src/modules/integrations/engine/mcp-tools.ts
// ============================================================================

// The MCP tool registry: the set of business capabilities Forge Nova
// exposes over the Model Context Protocol. Tool names and argument
// schemas are pinned; unknown tools and bad arguments are named
// refusals — an MCP client never gets a silent default.

export type Verdict<T> = { ok: true; value: T } | { ok: false; reason: string };

export interface McpToolDefinition {
  name: string;
  description: string;
  requiredArgs: string[];
  optionalArgs: string[];
  argTypes: Record<string, 'string' | 'number' | 'boolean'>;
}

export const MCP_TOOLS: McpToolDefinition[] = [
  {
    name: 'draft_invoice',
    description: 'Draft an invoice from free text like "3 web design at 50000, logo 20000".',
    requiredArgs: ['text'],
    optionalArgs: [],
    argTypes: { text: 'string' },
  },
  {
    name: 'weekly_report',
    description: 'Weekly business report: invoiced, collected, expenses, net, alerts.',
    requiredArgs: [],
    optionalArgs: [],
    argTypes: {},
  },
  {
    name: 'cashflow_forecast',
    description: 'Cashflow forecast over a horizon in days from open invoices and monthly burn.',
    requiredArgs: [],
    optionalArgs: ['days'],
    argTypes: { days: 'number' },
  },
  {
    name: 'search',
    description: 'Natural-language search across invoices, payments and expenses.',
    requiredArgs: ['query'],
    optionalArgs: [],
    argTypes: { query: 'string' },
  },
  {
    name: 'compute_vat',
    description: 'VAT breakdown (net/vat/gross) for an amount in cents, rate in basis points.',
    requiredArgs: ['amountCents', 'rateBps', 'mode'],
    optionalArgs: [],
    argTypes: { amountCents: 'number', rateBps: 'number', mode: 'string' },
  },
  {
    name: 'next_actions',
    description: 'Ranked next CRM outreach actions: overdue first, weighted by value and staleness.',
    requiredArgs: [],
    optionalArgs: [],
    argTypes: {},
  },
  {
    name: 'reorder_plan',
    description: 'Reorder plan for a stock item by id.',
    requiredArgs: ['itemId'],
    optionalArgs: [],
    argTypes: { itemId: 'string' },
  },
];

export function listTools(): McpToolDefinition[] {
  return MCP_TOOLS;
}

export function resolveTool(name: string): Verdict<McpToolDefinition> {
  const found = MCP_TOOLS.find((t) => t.name === name);
  if (!found) return { ok: false, reason: 'mcp-unknown-tool:' + name };
  return { ok: true, value: found };
}

export function validateToolArgs(name: string, args: Record<string, unknown>): Verdict<Record<string, unknown>> {
  const tool = resolveTool(name);
  if (!tool.ok) return tool;
  const cleaned: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(args ?? {})) {
    const expected = tool.value.argTypes[field];
    if (expected === undefined) {
      return { ok: false, reason: 'mcp-unknown-arg:' + field };
    }
    if (typeof value !== expected) {
      return { ok: false, reason: 'mcp-invalid-arg:' + field };
    }
    cleaned[field] = value;
  }
  for (const required of tool.value.requiredArgs) {
    if (!(required in cleaned)) {
      return { ok: false, reason: 'mcp-missing-arg:' + required };
    }
  }
  return { ok: true, value: cleaned };
}
