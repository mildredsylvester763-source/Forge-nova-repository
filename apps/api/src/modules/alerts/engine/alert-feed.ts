// ============================================================================
// FILE: /apps/api/src/modules/alerts/engine/alert-feed.ts
// ============================================================================
// Pure alert feed engine. No database, no clock, no network — the caller
// loads raw notifications and opportunities, and this file decides what is
// actually urgent, in what order, and which items earn a one-click spin-up.
// Fail-visible: nothing is invented here, only re-ranked and explained.

import { ProductType } from '../../products/enums';
import { OpportunityCategory } from '../../opportunities/enums';

export type AlertSeverity = 'critical' | 'high' | 'info';

export interface NotificationLike {
  id: string;
  type: string;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
  occurredAt: string;   // ISO timestamp
}

export interface OpportunityLike {
  id: string;
  title: string;
  score: number;        // 0-100 composite
  status: string;
  category: string;
  occurredAt: string;   // ISO timestamp of last activity
}

export interface AlertItem {
  key: string;                       // stable identity for dedupe
  kind: 'notification' | 'opportunity_signal';
  severity: AlertSeverity;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
  occurredAt: string;
  spinUpEligible: boolean;
  reasons: string[];
}

// How urgent each persisted notification type is on the feed. Anything
// unknown is info — never silently dropped, never inflated.
const NOTIFICATION_SEVERITY: Record<string, AlertSeverity> = {
  decision: 'critical',
  scan_failed: 'high',
  scan_completed: 'info',
  scan_update: 'info',
  opportunity_scored: 'info',
  system: 'info',
};

export const HIGH_SCORE_DEFAULT = 75;

// Statuses where an opportunity is still up for grabs. Once it is building,
// live or dead, spinning it up from the feed would be noise.
const SPIN_UP_STATUSES = [
  'discovered', 'new', 'scoring', 'vetted', 'validating',
];

const SEVERITY_RANK: Record<AlertSeverity, number> = { critical: 0, high: 1, info: 2 };

export function buildAlertFeed(input: {
  notifications: NotificationLike[];
  opportunities: OpportunityLike[];
  highScoreThreshold?: number;
}): AlertItem[] {
  const threshold =
    typeof input.highScoreThreshold === 'number' && input.highScoreThreshold > 0
      ? input.highScoreThreshold
      : HIGH_SCORE_DEFAULT;

  const items: AlertItem[] = [];

  for (const notification of input.notifications) {
    const severity = NOTIFICATION_SEVERITY[notification.type] || 'info';
    items.push({
      key: 'notification:' + notification.id,
      kind: 'notification',
      severity,
      title: notification.title,
      message: notification.message,
      entityType: notification.entityType,
      entityId: notification.entityId,
      occurredAt: notification.occurredAt,
      spinUpEligible: false,
      reasons: ['persisted notification of type ' + notification.type],
    });
  }

  for (const opportunity of input.opportunities) {
    if (opportunity.score < threshold) continue;
    if (!SPIN_UP_STATUSES.includes(opportunity.status)) continue;
    items.push({
      key: 'opportunity_signal:' + opportunity.id,
      kind: 'opportunity_signal',
      severity: 'high',
      title: 'High-score opportunity waiting: ' + opportunity.title,
      message:
        opportunity.title + ' scored ' + Math.round(opportunity.score) +
        ' and is still in ' + opportunity.status + ' — one click turns it into a draft product.',
      entityType: 'opportunity',
      entityId: opportunity.id,
      occurredAt: opportunity.occurredAt,
      spinUpEligible: true,
      reasons: [
        'score ' + Math.round(opportunity.score) + ' meets the alert threshold of ' + threshold,
        'status ' + opportunity.status + ' is still pre-build',
      ],
    });
  }

  // Severity first, then newest. ISO strings sort chronologically, so no
  // clock is needed inside the engine.
  items.sort((a, b) => {
    const rank = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (rank !== 0) return rank;
    return a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0;
  });

  // Same key twice (a retry, a race) must not flood the feed twice.
  const seen = new Set<string>();
  const deduped: AlertItem[] = [];
  for (const item of items) {
    if (seen.has(item.key)) continue;
    seen.add(item.key);
    deduped.push(item);
  }

  return deduped;
}

// ── One-click spin-up mapping ────────────────────────────────────────────
// An opportunity category says what kind of draft product it should become.
// Every group carries its reason; unmapped categories land in a generic
// bundle draft, which is honest — the human decides the real shape later.

export interface ProductTypeMapping {
  productType: ProductType;
  reason: string;
}

const PHYSICAL_TYPES: string[] = [
  'physical_micro_manufacturing', 'seasonal_physical_goods', 'seasonal_goods',
  'merchandise', 'handmade_crafts', 'fashion', 'food_and_beverage',
  'beauty_personal_care', 'home_living', 'toys_games', 'pet_products',
  'fitness_wellness', 'electronics_accessories',
];

const SERVICE_TYPES: string[] = [
  'local_services', 'consulting', 'freelance_services', 'agency_services',
  'digital_marketing', 'affiliate_marketing', 'design_services',
  'technical_services', 'coaching_mentorship', 'events_retreats',
];

const COURSE_TYPES: string[] = [
  'online_courses', 'workshops', 'niche_education',
];

const TEMPLATE_TYPES: string[] = [
  'templates',
];

const DATASET_TYPES: string[] = [
  'data_arbitrage', 'data_products', 'datasets',
];

const TOOL_TYPES: string[] = [
  'software_tools', 'saas_micro', 'ai_wrappers', 'mobile_apps', 'games',
  'plugins_extensions', 'api_products', 'automations',
];

const EBOOK_TYPES: string[] = [
  'ebooks', 'content', 'newsletters', 'podcasts', 'video_content',
  'membership_communities',
];

export function categoryToProductType(category: string): ProductTypeMapping {
  if (category === OpportunityCategory.PRINT_ON_DEMAND) {
    return { productType: ProductType.PRINT_ON_DEMAND, reason: 'print-on-demand category maps straight to a POD draft' };
  }
  if (category === OpportunityCategory.THREE_D_PRINTING) {
    return { productType: ProductType.THREE_D_PRINT, reason: '3D-printing category maps to a 3D-print draft' };
  }
  if (PHYSICAL_TYPES.includes(category)) {
    return { productType: ProductType.CUSTOM_MANUFACTURED, reason: 'physical goods category starts as a custom-manufactured brief' };
  }
  if (SERVICE_TYPES.includes(category)) {
    return { productType: ProductType.SERVICE_PACKAGE, reason: 'services category starts as a service package' };
  }
  if (COURSE_TYPES.includes(category)) {
    return { productType: ProductType.COURSE, reason: 'education category starts as a course' };
  }
  if (TEMPLATE_TYPES.includes(category)) {
    return { productType: ProductType.TEMPLATE, reason: 'template category maps one-to-one' };
  }
  if (DATASET_TYPES.includes(category)) {
    return { productType: ProductType.DATASET, reason: 'data category starts as a dataset product' };
  }
  if (TOOL_TYPES.includes(category)) {
    return { productType: ProductType.TOOL, reason: 'software category starts as a tool draft' };
  }
  if (EBOOK_TYPES.includes(category)) {
    return { productType: ProductType.EBOOK, reason: 'knowledge/audience category starts as a written draft' };
  }
  return { productType: ProductType.BUNDLE, reason: 'category ' + category + ' has no direct product shape — a bundle draft keeps it visible' };
}
