// ============================================================================
// FILE: /apps/api/src/modules/opportunities/enums.ts
// ============================================================================

// ─── Category ──────────────────────────────────────────────────────────────
// The seven value-chain categories Forge Nova scouts across.
export enum OpportunityCategory {
  CONTENT = 'content',
  PHYSICAL_MICRO_MANUFACTURING = 'physical_micro_manufacturing',
  LOCAL_SERVICES = 'local_services',
  DIGITAL_PRODUCTS = 'digital_products',
  DATA_ARBITRAGE = 'data_arbitrage',
  NICHE_EDUCATION = 'niche_education',
  SEASONAL_PHYSICAL_GOODS = 'seasonal_physical_goods',
}

// ─── Source ────────────────────────────────────────────────────────────────
// Where an opportunity signal originates (multi-source scanner inputs).
export enum OpportunitySource {
  TREND_RADAR = 'trend_radar',
  SEARCH_VOLUME = 'search_volume',
  SOCIAL_SIGNALS = 'social_signals',
  LOCAL_DEMAND = 'local_demand',
  SEASONAL_CALENDAR = 'seasonal_calendar',
  COMPETITOR_GAP = 'competitor_gap',
  PRICE_ARBITRAGE = 'price_arbitrage',
  REGULATORY_SHIFT = 'regulatory_shift',
  COMMUNITY_REQUEST = 'community_request',
  MANUAL_DISCOVERY = 'manual_discovery',
}

// ─── Status (lifecycle) ─────────────────────────────────────────────────────
// Full lifecycle: signal → vetted → experiment → live → scaled/retired.
export enum OpportunityStatus {
  NEW = 'new',
  SCORING = 'scoring',
  VETTED = 'vetted',
  QUEUED_FOR_BUILD = 'queued_for_build',
  BUILDING = 'building',
  EXPERIMENTING = 'experimenting',
  LIVE = 'live',
  SCALING = 'scaling',
  PIVOTING = 'pivoting',
  KILLED = 'killed',
  RETIRED = 'retired',
  ARCHIVED = 'archived',
}

// ─── Priority ───────────────────────────────────────────────────────────────
export enum OpportunityPriority {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
  WATCHLIST = 'watchlist',
}

// ─── Risk Level ─────────────────────────────────────────────────────────────
// Used with per-country/category regulatory flags.
export enum RiskLevel {
  MINIMAL = 'minimal',
  LOW = 'low',
  MODERATE = 'moderate',
  HIGH = 'high',
  SEVERE = 'severe',
  PROHIBITED = 'prohibited',
}

// ─── Scan Status ────────────────────────────────────────────────────────────
export enum ScanStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  PARTIAL = 'partial',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

// ─── History Action ──────────────────────────────────────────────────────────
export enum OpportunityHistoryAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  STATUS_CHANGE = 'STATUS_CHANGE',
  SCORE_CHANGE = 'SCORE_CHANGE',
  KILL = 'KILL',
  SCALE = 'SCALE',
  PIVOT = 'PIVOT',
  ARCHIVE = 'ARCHIVE',
  NOTE = 'NOTE',
}

// ─── Decision (kill / scale / pivot engine) ─────────────────────────────────
export enum OpportunityDecision {
  SCALE = 'scale',
  HOLD = 'hold',
  PIVOT = 'pivot',
  KILL = 'kill',
}
