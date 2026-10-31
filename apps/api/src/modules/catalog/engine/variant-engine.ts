// ============================================================================
// Pure variant-grid engine. Follows the product-variant model the commerce
// and inventory market ships (Shopify, Square, WooCommerce, Zoho Inventory):
// a product with up to three named options, each option holding a list of
// values, and a variant for every combination with its own SKU, price and
// barcode. Shopify caps grids at 100 variants; so does this engine. Every
// refusal is named and nothing is built until the whole grid is valid.
// ============================================================================

export type Verdict<T> = { ok: true; value: T } | { ok: false; reason: string };

export const VARIANT_MAX_OPTIONS = 3;
export const VARIANT_MAX_TOTAL = 100;
export const VARIANT_SKU_MAX = 64;
export const CATALOG_NAME_MAX = 120;
export const OPTION_NAME_MAX = 40;
export const OPTION_VALUE_MAX = 40;
export const OPTION_MAX_VALUES = 40;
export const VARIANT_PRICE_MAX_CENTS = 999999999;

export interface CatalogOption {
  name: string;
  values: string[];
}

export interface VariantPlan {
  sku: string;
  optionValues: string[];
  unitPriceCents: number;
}

export function validateCatalogName(name: unknown): Verdict<string> {
  if (typeof name !== 'string') return { ok: false, reason: 'catalog-invalid-name' };
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > CATALOG_NAME_MAX) return { ok: false, reason: 'catalog-invalid-name' };
  return { ok: true, value: trimmed };
}

export function sanitizeSkuPart(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
}

export function validateUnitPriceCents(price: unknown): Verdict<number> {
  if (typeof price !== 'number' || !Number.isInteger(price) || price < 0 || price > VARIANT_PRICE_MAX_CENTS) {
    return { ok: false, reason: 'variant-invalid-price' };
  }
  return { ok: true, value: price };
}

export function validateOptionSet(options: unknown): Verdict<CatalogOption[]> {
  if (options === null || options === undefined) return { ok: true, value: [] };
  if (!Array.isArray(options)) return { ok: false, reason: 'variant-invalid-options' };
  if (options.length > VARIANT_MAX_OPTIONS) return { ok: false, reason: 'variant-too-many-options' };
  const cleaned: CatalogOption[] = [];
  for (const raw of options) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: 'variant-invalid-options' };
    const rawName = (raw as { name?: unknown }).name;
    if (typeof rawName !== 'string') return { ok: false, reason: 'variant-invalid-option-name' };
    const name = rawName.trim();
    if (name.length < 1 || name.length > OPTION_NAME_MAX) return { ok: false, reason: 'variant-invalid-option-name' };
    const rawValues = (raw as { values?: unknown }).values;
    if (!Array.isArray(rawValues)) return { ok: false, reason: 'variant-invalid-values' };
    if (rawValues.length < 2) return { ok: false, reason: 'variant-too-few-values' };
    if (rawValues.length > OPTION_MAX_VALUES) return { ok: false, reason: 'variant-too-many-values' };
    const values: string[] = [];
    const seen = new Set<string>();
    for (const rv of rawValues) {
      if (typeof rv !== 'string') return { ok: false, reason: 'variant-invalid-value' };
      const v = rv.trim();
      if (v.length < 1 || v.length > OPTION_VALUE_MAX) return { ok: false, reason: 'variant-invalid-value' };
      const key = v.toLowerCase();
      if (seen.has(key)) return { ok: false, reason: 'variant-duplicate-value' };
      seen.add(key);
      values.push(v);
    }
    cleaned.push({ name, values });
  }
  return { ok: true, value: cleaned };
}

export function buildVariants(
  name: string,
  options: CatalogOption[],
  unitPriceCents: unknown,
): Verdict<VariantPlan[]> {
  const price = validateUnitPriceCents(unitPriceCents);
  if (!price.ok) return price;
  if (!Array.isArray(options)) return { ok: false, reason: 'variant-invalid-options' };
  let combos: string[][] = [[]];
  for (const opt of options) {
    if (!opt || !Array.isArray(opt.values)) return { ok: false, reason: 'variant-invalid-values' };
    const next: string[][] = [];
    for (const combo of combos) {
      for (const v of opt.values) next.push(combo.concat([v]));
    }
    combos = next;
  }
  if (combos.length > VARIANT_MAX_TOTAL) return { ok: false, reason: 'variant-too-many-variants' };
  const base = sanitizeSkuPart(name);
  const plans: VariantPlan[] = [];
  const seenSkus = new Set<string>();
  for (const combo of combos) {
    const parts: string[] = base === '' ? [] : [base];
    for (const v of combo) {
      const p = sanitizeSkuPart(v);
      if (p !== '') parts.push(p);
    }
    if (parts.length === 0) return { ok: false, reason: 'variant-sku-part-empty' };
    const sku = parts.join('-');
    if (sku.length > VARIANT_SKU_MAX) return { ok: false, reason: 'variant-sku-too-long' };
    if (seenSkus.has(sku)) return { ok: false, reason: 'variant-duplicate-sku' };
    seenSkus.add(sku);
    plans.push({ sku, optionValues: combo, unitPriceCents: price.value });
  }
  return { ok: true, value: plans };
}
