// ============================================================================
// FILE: /apps/api/src/modules/integrations/engine/connector-catalog.ts
// ============================================================================

// The connector catalog: the named universe of integrations Forge Nova
// offers. Unknown connector ids and missing/unknown credentials are named
// refusals — the platform never guesses a provider, and never stores a
// credential it cannot name. 'custom' is the escape hatch for any
// user-owned HTTP endpoint.

export type Verdict<T> = { ok: true; value: T } | { ok: false; reason: string };

export type ConnectorKind = 'payment' | 'sync' | 'automation' | 'accounting' | 'chat' | 'custom';

export interface ConnectorDefinition {
  id: string;
  name: string;
  kind: ConnectorKind;
  description: string;
  requiredCredentials: string[];
  optionalCredentials: string[];
  events: string[];
}

export const CONNECTORS: ConnectorDefinition[] = [
  {
    id: 'stripe', name: 'Stripe', kind: 'payment',
    description: 'Card and bank charge processing with webhook confirmation.',
    requiredCredentials: ['secretKey'],
    optionalCredentials: ['webhookSecret'],
    events: ['payment.received', 'invoice.paid'],
  },
  {
    id: 'paystack', name: 'Paystack', kind: 'payment',
    description: 'Nigerian card, bank transfer and USSD collections.',
    requiredCredentials: ['secretKey'],
    optionalCredentials: ['publicKey'],
    events: ['payment.received', 'invoice.paid'],
  },
  {
    id: 'flutterwave', name: 'Flutterwave', kind: 'payment',
    description: 'Pan-African payments across cards, transfers and mobile money.',
    requiredCredentials: ['secretKey'],
    optionalCredentials: ['encryptionKey'],
    events: ['payment.received', 'invoice.paid'],
  },
  {
    id: 'paypal', name: 'PayPal', kind: 'payment',
    description: 'Cross-border checkout and payouts.',
    requiredCredentials: ['clientId', 'clientSecret'],
    optionalCredentials: [],
    events: ['payment.received'],
  },
  {
    id: 'quickbooks', name: 'QuickBooks', kind: 'accounting',
    description: 'Two-way ledger and invoice sync with QuickBooks Online.',
    requiredCredentials: ['clientId', 'clientSecret', 'realmId'],
    optionalCredentials: ['refreshToken'],
    events: ['invoice.created', 'invoice.paid', 'expense.recorded'],
  },
  {
    id: 'xero', name: 'Xero', kind: 'accounting',
    description: 'Two-way ledger and contact sync with Xero.',
    requiredCredentials: ['clientId', 'clientSecret'],
    optionalCredentials: ['tenantId'],
    events: ['invoice.created', 'invoice.paid', 'expense.recorded'],
  },
  {
    id: 'slack', name: 'Slack', kind: 'chat',
    description: 'Post business events and reports into Slack channels.',
    requiredCredentials: ['botToken'],
    optionalCredentials: ['channel'],
    events: ['invoice.overdue', 'report.weekly'],
  },
  {
    id: 'zapier', name: 'Zapier', kind: 'automation',
    description: 'Route Forge Nova events into Zapier workflows.',
    requiredCredentials: ['webhookUrl'],
    optionalCredentials: [],
    events: ['all'],
  },
  {
    id: 'make', name: 'Make', kind: 'automation',
    description: 'Route Forge Nova events into Make scenarios.',
    requiredCredentials: ['webhookUrl'],
    optionalCredentials: [],
    events: ['all'],
  },
  {
    id: 'google-workspace', name: 'Google Workspace', kind: 'sync',
    description: 'Calendar and contact sync with Google Workspace.',
    requiredCredentials: ['clientId', 'clientSecret', 'refreshToken'],
    optionalCredentials: [],
    events: ['contact.created', 'appointment.booked'],
  },
  {
    id: 'microsoft-365', name: 'Microsoft 365', kind: 'sync',
    description: 'Calendar and contact sync with Microsoft 365.',
    requiredCredentials: ['clientId', 'clientSecret', 'tenantId'],
    optionalCredentials: ['refreshToken'],
    events: ['contact.created', 'appointment.booked'],
  },
  {
    id: 'open-banking', name: 'Open Banking', kind: 'sync',
    description: 'Bank feed ingestion over open banking APIs.',
    requiredCredentials: ['bankId', 'accessToken'],
    optionalCredentials: ['accountId'],
    events: ['payment.received'],
  },
  {
    id: 'custom', name: 'Custom Connection', kind: 'custom',
    description: 'Any user-owned HTTP endpoint with header auth.',
    requiredCredentials: ['url', 'authHeader'],
    optionalCredentials: ['authValue'],
    events: ['all'],
  },
];

export function listConnectors(): ConnectorDefinition[] {
  return CONNECTORS;
}

export function lookupConnector(id: string): Verdict<ConnectorDefinition> {
  const found = CONNECTORS.find((c) => c.id === id);
  if (!found) return { ok: false, reason: 'connector-unknown:' + id };
  return { ok: true, value: found };
}

export function validateCredentials(
  id: string,
  provided: Record<string, string>,
): Verdict<{ accepted: string[]; unknown: string[] }> {
  const connector = lookupConnector(id);
  if (!connector.ok) return connector;
  const known = [...connector.value.requiredCredentials, ...connector.value.optionalCredentials];
  const accepted: string[] = [];
  const unknown: string[] = [];
  for (const [field, value] of Object.entries(provided ?? {})) {
    if (!known.includes(field)) {
      unknown.push(field);
      continue;
    }
    if (typeof value !== 'string' || !value.trim()) {
      return { ok: false, reason: 'connector-empty-credential:' + field };
    }
    accepted.push(field);
  }
  const missing = connector.value.requiredCredentials.filter((f) => !(f in (provided ?? {})));
  if (missing.length) {
    return { ok: false, reason: 'connector-missing-credential:' + missing.join(',') };
  }
  return { ok: true, value: { accepted, unknown } };
}
