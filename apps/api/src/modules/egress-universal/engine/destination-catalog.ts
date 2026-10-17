// ============================================================================
// FILE: /apps/api/src/modules/egress-universal/engine/destination-catalog.ts
// ============================================================================
// The universal destination catalog: every named outbound system Forge
// Nova can connect to, beyond the 13 accounting/payment connectors. Each
// entry pins its kind, auth style, credential requirements, base URL and
// health path. The platform never guesses a destination and never stores
// a credential it cannot name. There is no artificial limit on catalog
// size — new destinations are added by pinning, not by magic.

export type Verdict<T> = { ok: true; value: T } | { ok: false, reason: string };

export type AuthStyle = 'api-key-header' | 'bearer' | 'basic' | 'oauth-code' | 'query-param';

export type DestinationKind =
  | 'messaging'
  | 'email'
  | 'open-banking'
  | 'ecommerce'
  | 'crm'
  | 'support'
  | 'storage'
  | 'productivity'
  | 'chat'
  | 'social'
  | 'finance'
  | 'data'
  | 'custom';

export interface DestinationDefinition {
  id: string;
  name: string;
  kind: DestinationKind;
  baseUrl: string;
  authStyle: AuthStyle;
  authHeader?: string;
  requiredCredentials: string[];
  optionalCredentials: string[];
  healthPath: string;
}

export const DESTINATIONS: DestinationDefinition[] = [
  // Open banking / financial data (Africa-first).
  { id: 'mono', name: 'Mono', kind: 'open-banking', baseUrl: 'https://api.withmono.com', authStyle: 'api-key-header', authHeader: 'mono-sec-key', requiredCredentials: ['secretKey'], optionalCredentials: [], healthPath: '/' },
  { id: 'okra', name: 'Okra', kind: 'open-banking', baseUrl: 'https://api.okra.ng', authStyle: 'bearer', requiredCredentials: ['secretKey'], optionalCredentials: ['clientToken'], healthPath: '/v2/sandbox' },
  { id: 'stitch', name: 'Stitch', kind: 'open-banking', baseUrl: 'https://api.stitch.money', authStyle: 'oauth-code', requiredCredentials: ['clientId', 'clientSecret'], optionalCredentials: ['refreshToken'], healthPath: '/health' },
  { id: 'payoneer', name: 'Payoneer', kind: 'finance', baseUrl: 'https://api.payoneer.com', authStyle: 'oauth-code', requiredCredentials: ['clientId', 'clientSecret'], optionalCredentials: [], healthPath: '/v4/health' },
  { id: 'wise', name: 'Wise', kind: 'finance', baseUrl: 'https://api.wise.com', authStyle: 'api-key-header', authHeader: 'Authorization', requiredCredentials: ['apiKey'], optionalCredentials: [], healthPath: '/v1/me' },

  // Messaging and email.
  { id: 'twilio', name: 'Twilio', kind: 'messaging', baseUrl: 'https://api.twilio.com', authStyle: 'basic', requiredCredentials: ['accountSid', 'authToken'], optionalCredentials: ['fromNumber'], healthPath: '/2010-04-01/Accounts' },
  { id: 'sendgrid', name: 'SendGrid', kind: 'email', baseUrl: 'https://api.sendgrid.com', authStyle: 'bearer', requiredCredentials: ['apiKey'], optionalCredentials: [], healthPath: '/v3/scopes' },
  { id: 'mailgun', name: 'Mailgun', kind: 'email', baseUrl: 'https://api.mailgun.net', authStyle: 'basic', requiredCredentials: ['apiKey', 'domain'], optionalCredentials: ['region'], healthPath: '/v3/domains' },
  { id: 'brevo', name: 'Brevo', kind: 'email', baseUrl: 'https://api.brevo.com', authStyle: 'api-key-header', authHeader: 'api-key', requiredCredentials: ['apiKey'], optionalCredentials: [], healthPath: '/v3/account' },
  { id: 'termii', name: 'Termii', kind: 'messaging', baseUrl: 'https://api.ng.termii.com', authStyle: 'api-key-header', authHeader: 'Authorization', requiredCredentials: ['apiKey'], optionalCredentials: ['senderId'], healthPath: '/api/sender-id' },
  { id: 'africastalking', name: 'Africa\u2019s Talking', kind: 'messaging', baseUrl: 'https://api.africastalking.com', authStyle: 'api-key-header', authHeader: 'apiKey', requiredCredentials: ['apiKey', 'username'], optionalCredentials: [], healthPath: '/version1/user' },

  // E-commerce.
  { id: 'shopify', name: 'Shopify', kind: 'ecommerce', baseUrl: 'https://{store}.myshopify.com', authStyle: 'api-key-header', authHeader: 'X-Shopify-Access-Token', requiredCredentials: ['store', 'accessToken'], optionalCredentials: [], healthPath: '/admin/api/2026-01/shop.json' },
  { id: 'woocommerce', name: 'WooCommerce', kind: 'ecommerce', baseUrl: 'https://{store}', authStyle: 'basic', requiredCredentials: ['store', 'consumerKey', 'consumerSecret'], optionalCredentials: [], healthPath: '/wp-json/wc/v3/system_status' },

  // CRM and support.
  { id: 'hubspot', name: 'HubSpot', kind: 'crm', baseUrl: 'https://api.hubapi.com', authStyle: 'oauth-code', requiredCredentials: ['accessToken'], optionalCredentials: ['refreshToken'], healthPath: '/crm/v3/objects/contacts?limit=1' },
  { id: 'salesforce', name: 'Salesforce', kind: 'crm', baseUrl: 'https://{instance}.salesforce.com', authStyle: 'bearer', requiredCredentials: ['instance', 'accessToken'], optionalCredentials: ['refreshToken'], healthPath: '/services/data/v60.0/limits' },
  { id: 'zoho-crm', name: 'Zoho CRM', kind: 'crm', baseUrl: 'https://www.zohoapis.com', authStyle: 'oauth-code', requiredCredentials: ['accessToken'], optionalCredentials: ['refreshToken'], healthPath: '/crm/v6/settings/org' },
  { id: 'pipedrive', name: 'Pipedrive', kind: 'crm', baseUrl: 'https://api.pipedrive.com', authStyle: 'query-param', requiredCredentials: ['apiToken'], optionalCredentials: ['companyDomain'], healthPath: '/v1/users/me' },
  { id: 'zendesk', name: 'Zendesk', kind: 'support', baseUrl: 'https://{subdomain}.zendesk.com', authStyle: 'bearer', requiredCredentials: ['subdomain', 'apiToken', 'email'], optionalCredentials: [], healthPath: '/api/v2/usage' },
  { id: 'intercom', name: 'Intercom', kind: 'support', baseUrl: 'https://api.intercom.io', authStyle: 'bearer', requiredCredentials: ['accessToken'], optionalCredentials: [], healthPath: '/admin' },

  // Storage and data.
  { id: 'dropbox', name: 'Dropbox', kind: 'storage', baseUrl: 'https://api.dropboxapi.com', authStyle: 'oauth-code', requiredCredentials: ['accessToken'], optionalCredentials: ['refreshToken'], healthPath: '/2/users/get_current_account' },
  { id: 'box', name: 'Box', kind: 'storage', baseUrl: 'https://api.box.com', authStyle: 'oauth-code', requiredCredentials: ['accessToken'], optionalCredentials: ['refreshToken'], healthPath: '/2.0/users/me' },
  { id: 'airtable', name: 'Airtable', kind: 'data', baseUrl: 'https://api.airtable.com', authStyle: 'bearer', requiredCredentials: ['apiKey'], optionalCredentials: ['baseId'], healthPath: '/v0/meta/whoami' },

  // Productivity.
  { id: 'notion', name: 'Notion', kind: 'productivity', baseUrl: 'https://api.notion.com', authStyle: 'bearer', requiredCredentials: ['integrationToken'], optionalCredentials: ['databaseId'], healthPath: '/v1/users/me' },
  { id: 'trello', name: 'Trello', kind: 'productivity', baseUrl: 'https://api.trello.com', authStyle: 'query-param', requiredCredentials: ['apiKey', 'apiToken'], optionalCredentials: [], healthPath: '/1/members/me' },
  { id: 'asana', name: 'Asana', kind: 'productivity', baseUrl: 'https://app.asana.com', authStyle: 'bearer', requiredCredentials: ['accessToken'], optionalCredentials: [], healthPath: '/api/1.0/users/me' },
  { id: 'jira', name: 'Jira', kind: 'productivity', baseUrl: 'https://{site}.atlassian.net', authStyle: 'basic', requiredCredentials: ['site', 'email', 'apiToken'], optionalCredentials: [], healthPath: '/rest/api/3/myself' },
  { id: 'linear', name: 'Linear', kind: 'productivity', baseUrl: 'https://api.linear.app', authStyle: 'api-key-header', authHeader: 'Authorization', requiredCredentials: ['apiKey'], optionalCredentials: [], healthPath: '/graphql' },

  // Chat and social.
  { id: 'discord', name: 'Discord', kind: 'chat', baseUrl: 'https://discord.com', authStyle: 'bearer', requiredCredentials: ['botToken'], optionalCredentials: ['webhookUrl'], healthPath: '/api/v10/gateway' },
  { id: 'telegram', name: 'Telegram', kind: 'chat', baseUrl: 'https://api.telegram.org', authStyle: 'query-param', requiredCredentials: ['botToken'], optionalCredentials: [], healthPath: '/bot{token}/getMe' },
  { id: 'whatsapp-cloud', name: 'WhatsApp Cloud API', kind: 'chat', baseUrl: 'https://graph.facebook.com', authStyle: 'bearer', requiredCredentials: ['accessToken', 'phoneNumberId'], optionalCredentials: [], healthPath: '/v21.0/me' },
  { id: 'slack', name: 'Slack', kind: 'chat', baseUrl: 'https://slack.com', authStyle: 'bearer', requiredCredentials: ['botToken'], optionalCredentials: ['channel'], healthPath: '/api/auth.test' },

  // Escape hatch: any user-owned HTTPS endpoint.
  { id: 'custom-http', name: 'Custom HTTPS Endpoint', kind: 'custom', baseUrl: 'https://{host}', authStyle: 'api-key-header', authHeader: 'Authorization', requiredCredentials: ['host'], optionalCredentials: ['authToken'], healthPath: '/' },
];

export function listDestinations(): DestinationDefinition[] {
  return DESTINATIONS;
}

export function lookupDestination(id: string): Verdict<DestinationDefinition> {
  const found = DESTINATIONS.find((d) => d.id === id);
  if (!found) return { ok: false, reason: 'destination-unknown:' + String(id) };
  return { ok: true, value: found };
}

export function validateCredentials(
  destinationId: string,
  credentials: Record<string, string>,
): Verdict<{ credentials: Record<string, string> }> {
  const dest = lookupDestination(destinationId);
  if (!dest.ok) return dest;
  if (!credentials || typeof credentials !== 'object') {
    return { ok: false, reason: 'destination-no-credentials' };
  }
  const cleaned: Record<string, string> = {};
  const known = [...dest.value.requiredCredentials, ...dest.value.optionalCredentials];
  for (const key of Object.keys(credentials)) {
    if (!known.includes(key)) {
      return { ok: false, reason: 'destination-unknown-credential:' + key };
    }
    const value = credentials[key];
    if (typeof value !== 'string' || !value.length) {
      return { ok: false, reason: 'destination-empty-credential:' + key };
    }
    if (value.length > 512) return { ok: false, reason: 'destination-credential-too-long:' + key };
    cleaned[key] = value;
  }
  for (const required of dest.value.requiredCredentials) {
    if (!(required in cleaned)) {
      return { ok: false, reason: 'destination-missing-credential:' + required };
    }
  }
  return { ok: true, value: { credentials: cleaned } };
}

// Resolves a destination's base URL against the user's credentials
// ({store}, {instance}, {subdomain}, {site}, {host}, {token} placeholders).
export function resolveBaseUrl(destinationId: string, credentials: Record<string, string>): Verdict<{ baseUrl: string }> {
  const dest = lookupDestination(destinationId);
  if (!dest.ok) return dest;
  let url = dest.value.baseUrl;
  const placeholders = url.match(/\{[a-z]+\}/g) ?? [];
  for (const ph of placeholders) {
    const key = ph.slice(1, -1);
    const value = credentials[key];
    if (typeof value !== 'string' || !value.length) {
      return { ok: false, reason: 'destination-missing-placeholder:' + key };
    }
    if (!/^[A-Za-z0-9.-]{1,200}$/.test(value)) {
      return { ok: false, reason: 'destination-invalid-placeholder:' + key };
    }
    url = url.replace(ph, value);
  }
  return { ok: true, value: { baseUrl: url } };
}
