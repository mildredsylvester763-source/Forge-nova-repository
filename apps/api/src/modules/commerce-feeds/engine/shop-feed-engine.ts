export type FeedVerdict<T> = { ok: true; value: T } | { ok: false; reason: string };

export const META_CHANNELS: string[] = ['facebook', 'instagram'];
export const AVAILABILITY_VALUES: string[] = ['in stock', 'out of stock', 'preorder', 'backorder'];
export const CONDITION_VALUES: string[] = ['new', 'refurbished', 'used'];

const trimmedStr = (raw: unknown): string | null => {
  if (typeof raw !== 'string') {
    return null;
  }
  return raw.trim();
};

export function validateChannel(raw: unknown): FeedVerdict<string> {
  if (typeof raw === 'string' && META_CHANNELS.includes(raw)) {
    return { ok: true, value: raw };
  }
  return { ok: false, reason: 'feed-unknown-channel' };
}

export function validateAvailability(raw: unknown): FeedVerdict<string> {
  if (typeof raw === 'string' && AVAILABILITY_VALUES.includes(raw)) {
    return { ok: true, value: raw };
  }
  return { ok: false, reason: 'feed-invalid-availability' };
}

export function validateCondition(raw: unknown): FeedVerdict<string> {
  if (typeof raw === 'string' && CONDITION_VALUES.includes(raw)) {
    return { ok: true, value: raw };
  }
  return { ok: false, reason: 'feed-invalid-condition' };
}

export function validateUrl(raw: unknown): FeedVerdict<string> {
  if (typeof raw !== 'string') {
    return { ok: false, reason: 'feed-invalid-url' };
  }
  const t = raw.trim();
  if (!t.startsWith('https://') || t.length > 2048 || /\s/.test(t)) {
    return { ok: false, reason: 'feed-invalid-url' };
  }
  const rest = t.slice('https://'.length);
  if (rest.length < 4) {
    return { ok: false, reason: 'feed-invalid-url' };
  }
  const host = rest.split('/')[0].split('?')[0];
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(host)) {
    return { ok: false, reason: 'feed-invalid-url' };
  }
  return { ok: true, value: t };
}

export function validatePriceCents(raw: unknown): FeedVerdict<number> {
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 1 && raw <= 1000000000) {
    return { ok: true, value: raw };
  }
  return { ok: false, reason: 'feed-invalid-price' };
}

export function validateCurrency(raw: unknown): FeedVerdict<string> {
  if (typeof raw !== 'string') {
    return { ok: false, reason: 'feed-invalid-currency' };
  }
  const t = raw.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(t)) {
    return { ok: false, reason: 'feed-invalid-currency' };
  }
  return { ok: true, value: t };
}

export function validateTitle(raw: unknown): FeedVerdict<string> {
  const t = trimmedStr(raw);
  if (t === null || t.length < 1 || t.length > 150) {
    return { ok: false, reason: 'feed-invalid-title' };
  }
  return { ok: true, value: t };
}

export function validateDescription(raw: unknown): FeedVerdict<string> {
  const t = trimmedStr(raw);
  if (t === null || t.length < 1 || t.length > 5000) {
    return { ok: false, reason: 'feed-invalid-description' };
  }
  return { ok: true, value: t };
}

export function validateSku(raw: unknown): FeedVerdict<string> {
  const t = trimmedStr(raw);
  if (t === null || t.length < 1 || t.length > 100) {
    return { ok: false, reason: 'feed-invalid-sku' };
  }
  return { ok: true, value: t };
}

export function validateItemGroup(raw: unknown): FeedVerdict<string> {
  const t = trimmedStr(raw);
  if (t === null || t.length < 1 || t.length > 100) {
    return { ok: false, reason: 'feed-invalid-item-group' };
  }
  return { ok: true, value: t };
}

export function validateBrand(raw: unknown): FeedVerdict<string | undefined> {
  if (raw === undefined || raw === null) {
    return { ok: true, value: undefined };
  }
  const t = trimmedStr(raw);
  if (t === null || t.length < 1 || t.length > 100) {
    return { ok: false, reason: 'feed-invalid-brand' };
  }
  return { ok: true, value: t };
}

export function validateGtin(raw: unknown): FeedVerdict<string | undefined> {
  if (raw === undefined || raw === null) {
    return { ok: true, value: undefined };
  }
  const t = trimmedStr(raw);
  if (t === null || !/^[0-9]{8,14}$/.test(t)) {
    return { ok: false, reason: 'feed-invalid-gtin' };
  }
  return { ok: true, value: t };
}

export function validateMpn(raw: unknown): FeedVerdict<string | undefined> {
  if (raw === undefined || raw === null) {
    return { ok: true, value: undefined };
  }
  const t = trimmedStr(raw);
  if (t === null || t.length < 1 || t.length > 50) {
    return { ok: false, reason: 'feed-invalid-mpn' };
  }
  return { ok: true, value: t };
}

export function formatPrice(cents: number): string {
  return Math.floor(cents / 100) + '.' + String(cents % 100).padStart(2, '0');
}

export interface MetaCatalogItemInput {
  channel: unknown;
  sku: unknown;
  itemGroupId: unknown;
  title: unknown;
  description: unknown;
  currency: unknown;
  priceCents: unknown;
  availability: unknown;
  condition: unknown;
  imageUrl: unknown;
  productUrl: unknown;
  brand: unknown;
}

export interface MetaCatalogItem {
  retailer_id: string;
  item_group_id: string;
  title: string;
  description: string;
  price: { amount: string; currency: string };
  availability: string;
  condition: string;
  image_url: string;
  link: string;
  brand?: string;
}

// Mirrors the Meta catalog product fields: retailer_id, item_group_id,
// title, description, price (amount + currency), availability, condition,
// image_url, link and the optional brand.
export function buildMetaCatalogItem(input: MetaCatalogItemInput): FeedVerdict<MetaCatalogItem> {
  const channel = validateChannel(input.channel);
  if (!channel.ok) {
    return channel;
  }
  const sku = validateSku(input.sku);
  if (!sku.ok) {
    return sku;
  }
  const itemGroupId = validateItemGroup(input.itemGroupId);
  if (!itemGroupId.ok) {
    return itemGroupId;
  }
  const title = validateTitle(input.title);
  if (!title.ok) {
    return title;
  }
  const description = validateDescription(input.description);
  if (!description.ok) {
    return description;
  }
  const currency = validateCurrency(input.currency);
  if (!currency.ok) {
    return currency;
  }
  const priceCents = validatePriceCents(input.priceCents);
  if (!priceCents.ok) {
    return priceCents;
  }
  const availability = validateAvailability(input.availability);
  if (!availability.ok) {
    return availability;
  }
  const condition = validateCondition(input.condition);
  if (!condition.ok) {
    return condition;
  }
  const imageUrl = validateUrl(input.imageUrl);
  if (!imageUrl.ok) {
    return imageUrl;
  }
  const productUrl = validateUrl(input.productUrl);
  if (!productUrl.ok) {
    return productUrl;
  }
  const brand = validateBrand(input.brand);
  if (!brand.ok) {
    return brand;
  }
  const payload: MetaCatalogItem = {
    retailer_id: sku.value,
    item_group_id: itemGroupId.value,
    title: title.value,
    description: description.value,
    price: { amount: formatPrice(priceCents.value), currency: currency.value },
    availability: availability.value,
    condition: condition.value,
    image_url: imageUrl.value,
    link: productUrl.value,
  };
  if (brand.value !== undefined) {
    payload.brand = brand.value;
  }
  return { ok: true, value: payload };
}

export interface GoogleProductEntryInput {
  id: unknown;
  title: unknown;
  description: unknown;
  link: unknown;
  imageLink: unknown;
  currency: unknown;
  priceCents: unknown;
  availability: unknown;
  condition: unknown;
  brand: unknown;
  gtin: unknown;
  mpn: unknown;
  identifierExists: unknown;
}

export interface GoogleProductEntry {
  id: string;
  title: string;
  description: string;
  link: string;
  image_link: string;
  price: string;
  availability: string;
  condition: string;
  brand?: string;
  gtin?: string;
  mpn?: string;
  identifier_exists?: string;
}

// Mirrors the seven required Google Merchant attributes (id, title,
// description, link, image_link, price, availability) plus condition and
// the identifier rule: custom goods without brand, gtin or mpn must be
// marked identifier_exists false.
export function buildGoogleProductEntry(input: GoogleProductEntryInput): FeedVerdict<GoogleProductEntry> {
  const id = validateSku(input.id);
  if (!id.ok) {
    return { ok: false, reason: 'feed-invalid-id' };
  }
  const title = validateTitle(input.title);
  if (!title.ok) {
    return title;
  }
  const description = validateDescription(input.description);
  if (!description.ok) {
    return description;
  }
  const link = validateUrl(input.link);
  if (!link.ok) {
    return link;
  }
  const imageLink = validateUrl(input.imageLink);
  if (!imageLink.ok) {
    return imageLink;
  }
  const currency = validateCurrency(input.currency);
  if (!currency.ok) {
    return currency;
  }
  const priceCents = validatePriceCents(input.priceCents);
  if (!priceCents.ok) {
    return priceCents;
  }
  const availability = validateAvailability(input.availability);
  if (!availability.ok) {
    return availability;
  }
  const condition = validateCondition(input.condition);
  if (!condition.ok) {
    return condition;
  }
  const brand = validateBrand(input.brand);
  if (!brand.ok) {
    return brand;
  }
  const gtin = validateGtin(input.gtin);
  if (!gtin.ok) {
    return gtin;
  }
  const mpn = validateMpn(input.mpn);
  if (!mpn.ok) {
    return mpn;
  }
  if (input.identifierExists !== undefined && typeof input.identifierExists !== 'boolean') {
    return { ok: false, reason: 'feed-invalid-identifier-exists' };
  }
  if (brand.value === undefined && gtin.value === undefined && mpn.value === undefined && input.identifierExists !== false) {
    return { ok: false, reason: 'feed-identifier-required' };
  }
  const entry: GoogleProductEntry = {
    id: id.value,
    title: title.value,
    description: description.value,
    link: link.value,
    image_link: imageLink.value,
    price: formatPrice(priceCents.value) + ' ' + currency.value,
    availability: availability.value,
    condition: condition.value,
  };
  if (brand.value !== undefined) {
    entry.brand = brand.value;
  }
  if (gtin.value !== undefined) {
    entry.gtin = gtin.value;
  }
  if (mpn.value !== undefined) {
    entry.mpn = mpn.value;
  }
  if (input.identifierExists === false) {
    entry.identifier_exists = 'false';
  }
  return { ok: true, value: entry };
}

export function escapeXml(text: string): string {
  let out = text;
  out = out.split('&').join('&amp;');
  out = out.split('<').join('&lt;');
  out = out.split('>').join('&gt;');
  out = out.split('"').join('&quot;');
  out = out.split("'").join('&apos;');
  return out;
}

// Mirrors the Google Merchant Center RSS 2.0 feed format using the g:
// namespace http://base.google.com/ns/1.0.
export function buildShoppingFeedXml(input: { title: string; generatedAtIso: string; entries: GoogleProductEntry[] }): string {
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
    '<channel>',
    '<title>' + escapeXml(input.title) + '</title>',
    '<lastBuildDate>' + escapeXml(input.generatedAtIso) + '</lastBuildDate>',
  ];
  for (const entry of input.entries) {
    lines.push('<item>');
    lines.push('<g:id>' + escapeXml(entry.id) + '</g:id>');
    lines.push('<g:title>' + escapeXml(entry.title) + '</g:title>');
    lines.push('<g:description>' + escapeXml(entry.description) + '</g:description>');
    lines.push('<g:link>' + escapeXml(entry.link) + '</g:link>');
    lines.push('<g:image_link>' + escapeXml(entry.image_link) + '</g:image_link>');
    lines.push('<g:price>' + escapeXml(entry.price) + '</g:price>');
    lines.push('<g:availability>' + escapeXml(entry.availability) + '</g:availability>');
    lines.push('<g:condition>' + escapeXml(entry.condition) + '</g:condition>');
    if (entry.brand !== undefined) {
      lines.push('<g:brand>' + escapeXml(entry.brand) + '</g:brand>');
    }
    if (entry.gtin !== undefined) {
      lines.push('<g:gtin>' + escapeXml(entry.gtin) + '</g:gtin>');
    }
    if (entry.mpn !== undefined) {
      lines.push('<g:mpn>' + escapeXml(entry.mpn) + '</g:mpn>');
    }
    if (entry.identifier_exists !== undefined) {
      lines.push('<g:identifier_exists>' + entry.identifier_exists + '</g:identifier_exists>');
    }
    lines.push('</item>');
  }
  lines.push('</channel>');
  lines.push('</rss>');
  return lines.join('\n');
}

export interface GoogleFeedCandidate {
  id: string;
  input: GoogleProductEntryInput;
}

// Builds the feed from candidates. Invalid candidates are skipped with a
// named reason; if nothing survives the feed is refused.
export function planGoogleFeed(candidates: GoogleFeedCandidate[]): FeedVerdict<{ entries: GoogleProductEntry[]; skipped: { id: string; reason: string }[] }> {
  const entries: GoogleProductEntry[] = [];
  const skipped: { id: string; reason: string }[] = [];
  for (const candidate of candidates) {
    const verdict = buildGoogleProductEntry(candidate.input);
    if (verdict.ok) {
      entries.push(verdict.value);
    } else {
      skipped.push({ id: candidate.id, reason: verdict.reason });
    }
  }
  if (entries.length < 1) {
    return { ok: false, reason: 'feed-no-valid-items' };
  }
  return { ok: true, value: { entries, skipped } };
}
