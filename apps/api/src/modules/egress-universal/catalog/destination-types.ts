// ============================================================================
// FILE: /apps/api/src/modules/egress-universal/engine/catalog/destination-types.ts
// ============================================================================
// Shared types for the universal destination catalog. Every connected app in
// Forge Nova is pinned here by name: id, kind, base URL, auth style, the exact
// credential fields the platform will ask the user for, and a health path the
// probe engine uses to verify the connection. The platform never guesses a
// destination and never stores a credential it cannot name.

export type Verdict<T> = { ok: true; value: T } | { ok: false; reason: string };

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
  | 'custom'
  | 'payments'
  | 'crypto'
  | 'accounting'
  | 'billing'
  | 'hr'
  | 'recruiting'
  | 'legal'
  | 'kyc'
  | 'esign'
  | 'scheduling'
  | 'devtools'
  | 'observability'
  | 'security'
  | 'qa'
  | 'identity'
  | 'shipping'
  | 'marketplace'
  | 'reviews'
  | 'marketing'
  | 'ads'
  | 'surveys'
  | 'forms'
  | 'analytics'
  | 'cloud'
  | 'database'
  | 'cms'
  | 'ai'
  | 'search'
  | 'automation'
  | 'notifications'
  | 'conferencing'
  | 'translation'
  | 'media'
  | 'music'
  | 'podcasts'
  | 'images'
  | 'games'
  | 'sports'
  | 'travel'
  | 'health'
  | 'energy'
  | 'iot'
  | 'location'
  | 'weather'
  | 'education'
  | 'government'
  | 'realestate';

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

// Compact factory used by the category files. Positional:
// (id, name, kind, baseUrl, authStyle, required, healthPath, authHeader?, optional?)
export const D = (
  id: string,
  name: string,
  kind: DestinationKind,
  baseUrl: string,
  authStyle: AuthStyle,
  required: string[],
  healthPath: string,
  authHeader?: string,
  optional: string[] = [],
): DestinationDefinition => ({
  id,
  name,
  kind,
  baseUrl,
  authStyle,
  authHeader,
  requiredCredentials: required,
  optionalCredentials: optional,
  healthPath,
});
