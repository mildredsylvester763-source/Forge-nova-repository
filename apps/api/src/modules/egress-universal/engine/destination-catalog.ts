// ============================================================================
// FILE: /apps/api/src/modules/egress-universal/engine/destination-catalog.ts
// ============================================================================
// The universal destination catalog: every named outbound system Forge
// Nova can connect to, beyond the 13 accounting/payment connectors. Each
// entry pins its kind, auth style, credential requirements, base URL and
// health path. The platform never guesses a destination and never stores
// a credential it cannot name. There is no artificial limit on catalog
// size — new destinations are added by pinning, not by magic.
//
// The catalog is organized by category files under ./catalog/. This module
// aggregates them into one flat, ordered list. Category boundaries are
// organizational only; lookup and validation treat every entry equally.

export type { Verdict, AuthStyle, DestinationKind, DestinationDefinition } from './catalog/destination-types';

import { DestinationDefinition } from './catalog/destination-types';
import { PAYMENTS } from './catalog/catalog-payments';
import { COMMUNICATIONS } from './catalog/catalog-communications';
import { BUSINESS } from './catalog/catalog-business';
import { ECOMMERCE } from './catalog/catalog-ecommerce';
import { CRM_MARKETING } from './catalog/catalog-crm-marketing';
import { DEVTOOLS } from './catalog/catalog-devtools';
import { CLOUD } from './catalog/catalog-cloud';
import { AI_DATA } from './catalog/catalog-ai-data';
import { MEDIA_SOCIAL } from './catalog/catalog-media-social';
import { LIFESTYLE } from './catalog/catalog-lifestyle';

export const DESTINATIONS: DestinationDefinition[] = [
  ...PAYMENTS,
  ...COMMUNICATIONS,
  ...BUSINESS,
  ...ECOMMERCE,
  ...CRM_MARKETING,
  ...DEVTOOLS,
  ...CLOUD,
  ...AI_DATA,
  ...MEDIA_SOCIAL,
  ...LIFESTYLE,

  // Escape hatch: any user-owned HTTPS endpoint.
  {
    id: 'custom-http',
    name: 'Custom HTTPS Endpoint',
    kind: 'custom',
    baseUrl: 'https://{host}',
    authStyle: 'api-key-header',
    authHeader: 'Authorization',
    requiredCredentials: ['host'],
    optionalCredentials: ['authToken'],
    healthPath: '/',
  },
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
