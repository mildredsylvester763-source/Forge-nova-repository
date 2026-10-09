// ============================================================================
// FILE: /apps/api/src/modules/regulatory/engine/regulatory-risk.ts
// ============================================================================
// Regulatory risk flags by country and category (Feature 6). Pure: no DB,
// no clock, no network. A deterministic knowledge base: given a country and
// a business category, name the permits, registrations, and constraints
// that apply — with severity, requirement, and a plain-language reason.
//
// Value question: "what will bite me AFTER I launch, that I could have
// known on day one?" Founders discover regulators by mail. This engine puts
// the letter on the desk before the launch.
//
// Policy (every number has a written reason):
//   - Severity is CALIBRATED, not decorative: 'critical' = launch-blocking
//     or business-ending exposure; 'warning' = real cost or friction, not
//     immediately fatal; 'info' = do-this-once paperwork.
//   - Risk level derives from the WORST flag, and the count of warnings:
//     one critical = high; two-plus warnings = medium; else low. The floor
//     is never faked upward to look cautious.
//   - Unknown countries degrade to the GLOBAL baseline (tax registration
//     + consumer law) with an explicit warning — never silence.
//   - The KB is deliberately small and honest: broad strokes that are true
//     everywhere, not 40 jurisdictions of half-remembered detail. The
//     output always tells the user to confirm with a local professional;
//     the engine is a pre-flight checklist, not legal advice.
//
// Contract: deterministic; category classes fall back from specific to
// default (food > physical, finance > service, etc.); every flag carries
// its reason.

export type FlagSeverity = 'critical' | 'warning' | 'info';

export interface RegulatoryFlag {
  code: string;
  title: string;
  severity: FlagSeverity;
  requirement: string;
  reason: string;
}

export interface RegulatoryAssessment {
  country: string;
  category: string;
  categoryClass: string;
  riskLevel: 'low' | 'medium' | 'high';
  flags: RegulatoryFlag[];
  checklist: string[];
  warnings: string[];
}

// Category classes: the KB keys. Specific beats general; the mapper below
// falls back down the chain.
type CategoryClass =
  | 'food' | 'health' | 'finance' | 'kids' | 'physical' | 'data' | 'digital' | 'service' | 'default';

const CLASS_CHAIN: Record<CategoryClass, CategoryClass[]> = {
  food: ['food', 'physical', 'default'],
  health: ['health', 'physical', 'default'],
  finance: ['finance', 'service', 'default'],
  kids: ['kids', 'physical', 'default'],
  physical: ['physical', 'default'],
  data: ['data', 'digital', 'default'],
  digital: ['digital', 'default'],
  service: ['service', 'default'],
  default: ['default'],
};

const CLASS_KEYWORDS: Array<[CategoryClass, string[]]> = [
  ['food', ['food', 'beverage', 'drink', 'snack', 'bakery', 'restaurant', 'catering', 'grocer', 'supplement']],
  ['health', ['health', 'medical', 'clinic', 'pharma', 'cosmetic', 'skincare', 'wellness', 'therapy', 'dental']],
  ['finance', ['finance', 'fintech', 'lending', 'loan', 'insurance', 'investment', 'payment', 'crypto', 'forex']],
  ['kids', ['kids', 'children', 'child', 'toy', 'baby', 'school']],
  ['data', ['data', 'dataset', 'analytics', 'lead', 'scraping', 'surveillance']],
  ['physical', ['merchandise', 'apparel', 'fashion', 'print', 'hardware', 'goods', 'product', 'ecommerce', 'retail', '3d']],
  ['digital', ['software', 'tool', 'ebook', 'course', 'template', 'newsletter', 'plugin', 'app', 'ai', 'saas']],
  ['service', ['service', 'consulting', 'agency', 'freelance', 'coaching', 'design', 'marketing']],
];

export function classifyCategory(category: string): CategoryClass {
  const c = String(category || '').toLowerCase();
  for (const [cls, keywords] of CLASS_KEYWORDS) {
    if (keywords.some(k => c.includes(k))) return cls;
  }
  return 'default';
}

// --- The knowledge base. Broad strokes, honestly labelled. --------------------
const f = (
  code: string, title: string, severity: FlagSeverity, requirement: string, reason: string,
): RegulatoryFlag => ({ code, title, severity, requirement, reason });

const GLOBAL_FLAGS: RegulatoryFlag[] = [
  f('TAX_REG', 'Tax registration', 'warning', 'Register the business for local tax before the first sale.', 'Selling without tax registration converts a paperwork problem into a penalty problem.'),
  f('CONSUMER_LAW', 'Consumer protection basics', 'info', 'Publish who you are, what you sell, and how refunds work.', 'Consumer law everywhere requires honest listing and a working refund path.'),
];

const BY_COUNTRY: Record<string, Record<string, RegulatoryFlag[]>> = {
  US: {
    physical: [
      f('US_SALES_TAX', 'Sales tax nexus', 'warning', 'Collect sales tax in states where you have nexus; start with your home state.', 'US sales tax is state-by-state; the obligation attaches at nexus, not at company size.'),
    ],
    food: [
      f('US_FDA', 'FDA food facility registration', 'critical', 'Register the facility, label per FDA rules, and follow the state cottage-food law if home-made.', 'US food sales without facility registration or cottage-food cover are recalled, not fined politely.'),
    ],
    finance: [
      f('US_MSB', 'Money services / lending exposure', 'critical', 'Do not touch payments or lending without checking FinCEN/state licensing first.', 'US money-transmission and lending are licensed activities; operating unlicensed is a felony, not a fine.'),
    ],
    kids: [
      f('US_COPPA', 'Children privacy (COPPA)', 'critical', 'If under-13 users are possible, implement verifiable parental consent.', 'COPPA violations are per-child penalties and are enforced even against small apps.'),
    ],
    health: [
      f('US_FDA_HEALTH', 'Health claims', 'critical', 'No disease-treatment claims without FDA clearance.', 'A health claim turns a product into an unapproved medical device or drug in the eyes of the FDA.'),
    ],
  },
  GB: {
    physical: [
      f('GB_VAT', 'VAT threshold', 'info', 'Register for VAT when turnover crosses the threshold (90,000 GBP as of 2024/25).', 'HMRC VAT registration is automatic obligation at the threshold; late registration collects back-tax.'),
    ],
    food: [
      f('GB_FSA', 'Food registration', 'critical', 'Register the food business with the local council at least 28 days before trading.', 'UK law requires registration before selling food; selling first is itself the offence.'),
    ],
    finance: [
      f('GB_FCA', 'FCA authorization', 'critical', 'Payment, lending, or investment activity needs FCA authorization or an exemption.', 'The FCA treats unlicensed consumer finance as criminal market abuse, with personal liability for directors.'),
    ],
  },
  EU: {
    physical: [
      f('EU_VAT_OSS', 'VAT / OSS', 'warning', 'Charge destination-country VAT; use the One-Stop-Shop scheme for B2C across the EU.', 'EU B2C sales carry destination VAT from the first euro; OSS is the sane route.'),
    ],
    data: [
      f('EU_GDPR', 'GDPR', 'critical', 'A lawful basis for personal data, a privacy notice, and deletion on request.', 'GDPR applies to any business serving EU people; fines scale with turnover and negligence.'),
    ],
    kids: [
      f('EU_KIDS', 'Minors and consent', 'warning', 'Extra consent and ad limits for minors; some member states require parental consent to 16.', 'EU member states set the digital consent age between 13 and 16; the safe line is 16.'),
    ],
  },
  NG: {
    physical: [
      f('NG_CAC', 'CAC registration', 'info', 'Register the business name with the Corporate Affairs Commission.', 'A registered name unlocks a business bank account; unregistered trading caps the business at cash.'),
      f('NG_NAFDAC', 'NAFDAC (if packaged food/drugs/cosmetics)', 'critical', 'Any packaged food, drink, drug, or cosmetic needs NAFDAC registration before sale.', 'NAFDAC shuts down and destroys unregistered stock; the loss is the inventory plus the fine.'),
    ],
    finance: [
      f('NG_CBN', 'CBN licensing', 'critical', 'Payments, lending, and float-holding need CBN licenses or a clear partnership with a licensed provider.', 'CBN treats unlicensed float-holding as illegal banking; partner with a licensed PSP instead of building your own rails.'),
    ],
  },
  IN: {
    physical: [
      f('IN_GST', 'GST registration', 'warning', 'Register for GST when turnover crosses the threshold (40 lakh INR for goods).', 'GST is compulsory past the threshold, and e-commerce platforms will not pay out without it.'),
    ],
    food: [
      f('IN_FSSAI', 'FSSAI license', 'critical', 'Any food business needs an FSSAI registration or license, scaled to size.', 'FSSAI operates a strict license regime; selling food without it invites seizure and penalty.'),
    ],
  },
  CA: {
    physical: [
      f('CA_GST_HST', 'GST/HST registration', 'info', 'Register for GST/HST past 30,000 CAD small-supplier threshold.', 'Canada refunds input credits only to registrants, so late registration is money lost both ways.'),
    ],
    kids: [
      f('CA_TOYS', 'Toy safety (CCSPA)', 'warning', 'Toys for children must meet the Canada Consumer Product Safety Act, including labeling.', 'CCSPA toy rules include small-parts and lead limits with recalls at the seller cost.'),
    ],
  },
  AU: {
    physical: [
      f('AU_GST', 'GST registration', 'info', 'Register for GST past 75,000 AUD turnover.', 'The ATO collects GST on sales from the threshold, registered or not; late registration back-collects.'),
    ],
    food: [
      f('AU_FSANZ', 'Food standards (FSANZ)', 'warning', 'Food must meet the FSANZ Code, including labeling; state-level notification applies.', 'FSANZ standards apply nationally on top of state food-business notifications.'),
    ],
  },
};

const SEVERITY_ORDER: Record<FlagSeverity, number> = { critical: 0, warning: 1, info: 2 };

export function assessRegulatoryRisk(country: string, category: string): RegulatoryAssessment {
  const countryKey = String(country || '').trim().toUpperCase();
  const cls = classifyCategory(category);
  const warnings: string[] = [];
  const flags: RegulatoryFlag[] = [];

  const countryKb = BY_COUNTRY[countryKey];
  if (!countryKb) {
    warnings.push('No specific rulebook stored for "' + (countryKey || 'unknown') + '" — showing the global baseline. Confirm with a local professional before launch.');
  }

  for (const clsKey of CLASS_CHAIN[cls]) {
    const countryFlags = countryKb ? countryKb[clsKey] || [] : [];
    const globalFlags = clsKey === 'default' ? GLOBAL_FLAGS : [];
    for (const flag of [...countryFlags, ...globalFlags]) {
      if (!flags.some(x => x.code === flag.code)) flags.push(flag);
    }
    if (countryFlags.length || globalFlags.length) break; // first match in the chain wins.
  }

  flags.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.code.localeCompare(b.code));

  const criticalCount = flags.filter(x => x.severity === 'critical').length;
  const warningCount = flags.filter(x => x.severity === 'warning').length;
  const riskLevel: 'low' | 'medium' | 'high' = criticalCount > 0 ? 'high' : warningCount >= 2 ? 'medium' : warningCount === 1 ? 'medium' : 'low';

  const checklist = flags.map(x => '[' + (x.severity === 'critical' ? 'BLOCKER' : x.severity === 'warning' ? 'BEFORE LAUNCH' : 'ONCE') + '] ' + x.title + ': ' + x.requirement);
  checklist.push('[ALWAYS] This checklist is a pre-flight screen, not legal advice — confirm with a local professional before money moves.');

  return {
    country: countryKey || 'unknown',
    category: String(category || ''),
    categoryClass: cls,
    riskLevel,
    flags,
    checklist,
    warnings,
  };
}
