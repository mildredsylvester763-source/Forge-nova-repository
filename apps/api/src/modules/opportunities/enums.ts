// ============================================================================
// FILE: /apps/api/src/modules/opportunities/enums.ts
// ============================================================================
// Domain vocabulary for the Opportunity & Intelligence Layer.
// AUTHORITATIVE: the service is the source of truth for names used at runtime;
// this enum set is its exact superset.

// ─── Category ──────────────────────────────────────────────────────────────
// The 7 value-chain categories from the Forge Nova concept PLUS the
// fine-grained micro-niches the source mappers classify into.
export enum OpportunityCategory {
  // Concept-level value-chain categories
  CONTENT = 'content',
  PHYSICAL_MICRO_MANUFACTURING = 'physical_micro_manufacturing',
  LOCAL_SERVICES = 'local_services',
  DIGITAL_PRODUCTS = 'digital_products',
  DATA_ARBITRAGE = 'data_arbitrage',
  NICHE_EDUCATION = 'niche_education',
  SEASONAL_PHYSICAL_GOODS = 'seasonal_physical_goods',
  // Software & digital niches
  SOFTWARE_TOOLS = 'software_tools',
  SAAS_MICRO = 'saas_micro',
  AI_WRAPPERS = 'ai_wrappers',
  MOBILE_APPS = 'mobile_apps',
  GAMES = 'games',
  PLUGINS_EXTENSIONS = 'plugins_extensions',
  API_PRODUCTS = 'api_products',
  AUTOMATIONS = 'automations',
  // Education & knowledge
  EBOOKS = 'ebooks',
  ONLINE_COURSES = 'online_courses',
  TEMPLATES = 'templates',
  COACHING_MENTORSHIP = 'coaching_mentorship',
  WORKSHOPS = 'workshops',
  // Physical goods
  PRINT_ON_DEMAND = 'print_on_demand',
  MERCHANDISE = 'merchandise',
  THREE_D_PRINTING = 'three_d_printing',
  HANDMADE_CRAFTS = 'handmade_crafts',
  FASHION = 'fashion',
  FOOD_AND_BEVERAGE = 'food_and_beverage',
  BEAUTY_PERSONAL_CARE = 'beauty_personal_care',
  HOME_LIVING = 'home_living',
  TOYS_GAMES = 'toys_games',
  PET_PRODUCTS = 'pet_products',
  FITNESS_WELLNESS = 'fitness_wellness',
  ELECTRONICS_ACCESSORIES = 'electronics_accessories',
  // Services
  CONSULTING = 'consulting',
  FREELANCE_SERVICES = 'freelance_services',
  AGENCY_SERVICES = 'agency_services',
  DIGITAL_MARKETING = 'digital_marketing',
  AFFILIATE_MARKETING = 'affiliate_marketing',
  DESIGN_SERVICES = 'design_services',
  TECHNICAL_SERVICES = 'technical_services',
  // Media & audience
  NEWSLETTERS = 'newsletters',
  PODCASTS = 'podcasts',
  VIDEO_CONTENT = 'video_content',
  STOCK_ASSETS = 'stock_assets',
  MEMBERSHIP_COMMUNITIES = 'membership_communities',
  EVENTS_RETREATS = 'events_retreats',
  // Data & arbitrage
  DATA_PRODUCTS = 'data_products',
  DATASETS = 'datasets',
  ARBITRAGE = 'arbitrage',
  LEAD_GENERATION = 'lead_generation',
  // Seasonal & fallback
  SEASONAL_GOODS = 'seasonal_goods',
  OTHER = 'other',
}

// ─── Source ────────────────────────────────────────────────────────────────
// Multi-source scanner inputs. The first five are wired in the service
// (Twitter, Reddit, Google Trends, GitHub, Google Search); the rest are
// registered now so each scanner connector lands without schema changes.
export enum OpportunitySource {
  // Wired in service
  TWITTER = 'twitter',
  REDDIT = 'reddit',
  GOOGLE_TRENDS = 'google_trends',
  GOOGLE_SEARCH = 'google_search',
  GITHUB = 'github',
  // Social & community
  TIKTOK = 'tiktok',
  INSTAGRAM = 'instagram',
  YOUTUBE = 'youtube',
  FACEBOOK = 'facebook',
  PINTEREST = 'pinterest',
  LINKEDIN = 'linkedin',
  PRODUCT_HUNT = 'product_hunt',
  HACKER_NEWS = 'hacker_news',
  STACK_OVERFLOW = 'stack_overflow',
  DISCORD = 'discord',
  TELEGRAM = 'telegram',
  WHATSAPP = 'whatsapp',
  TUMBLR = 'tumblr',
  TWITCH = 'twitch',
  // Marketplaces & commerce
  AMAZON = 'amazon',
  ETSY = 'etsy',
  EBAY = 'ebay',
  SHOPIFY_EXCHANGE = 'shopify_exchange',
  ALIBABA = 'alibaba',
  APP_STORE = 'app_store',
  PLAY_STORE = 'play_store',
  STEAM = 'steam',
  // Crowdfunding & demand signals
  KICKSTARTER = 'kickstarter',
  INDIEGOGO = 'indiegogo',
  UPWORK = 'upwork',
  FIVERR = 'fiverr',
  JOB_BOARDS = 'job_boards',
  // Search & keyword intelligence
  KEYWORD_PLANNER = 'keyword_planner',
  BING_SEAR
CH = 'bing_search',
  NEWS_RSS = 'news_rss',
  // Local & regulatory
  GOVERNMENT_TENDERS = 'government_tenders',
  LOCAL_DEMAND = 'local_demand',
  SEASONAL_CALENDAR = 'seasonal_calendar',
  COMPETITOR_GAP = 'competitor_gap',
  PRICE_ARBITRAGE = 'price_arbitrage',
  REGULATORY_SHIFT = 'regulatory_shift',
  COMMUNITY_REQUEST = 'community_request',
  MANUAL_DISCOVERY = 'manual_discovery',
}

// ─── Status (lifecycle) ─────────────────────────────────────────────────────
// Superset: concept lifecycle + the exact statuses the service transitions.
export enum OpportunityStatus {
  DISCOVERED = 'discovered',
  NEW = 'new',
  SCORING = 'scoring',
  VETTED = 'vetted',
  VALIDATING = 'validating',
  APPROVED = 'approved',
  QUEUED_FOR_BUILD = 'queued_for_build',
  BUILDING = 'building',
  EXPERIMENTING = 'experimenting',
  GTM_LAUNCHING = 'gtm_launching',
  OPERATIONS_ACTIVE = 'operations_active',
  LIVE = 'live',
  SCALING = 'scaling',
  PAUSING = 'pausing',
  PAUSED = 'paused',
  PIVOTING = 'pivoting',
  KILLED = 'killed',
  RETIRED = 'retired',
  ARCHIVED = 'archived',
}

// ─── Priority ───────────────────────────────────────────────────────────────
// Includes VERY_HIGH / VERY_LOW used by the Reddit and GitHub priority
// mappers, plus the concept tiers.
export enum OpportunityPriority {
  CRITICAL = 'critical',
  VERY_HIGH = 'very_high',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
  VERY_LOW = 'very_low',
  WATCHLIST = 'watchlist',
}

// ─── Risk Level ─────────────────────────────────────────────────────────────
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

// ─── History Action ────────────────────────────────────────────────────────
export enum OpportunityHistoryAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  RESTORE = 'RESTORE',
  STATUS_CHANGE = 'STATUS_CHANGE',
  PRIORITY_CHANGE = 'PRIORITY_CHANGE',
  SCORE_CHANGE = 'SCORE_CHANGE',
  ACCESS = 'ACCESS',
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
