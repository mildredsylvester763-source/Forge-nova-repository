export type CampaignVerdict<T> = { ok: true; value: T } | { ok: false; reason: string };

export const ALLOWED_VARIABLES: string[] = ['first_name', 'last_name', 'shop_name'];
export const BLOCK_TYPES: string[] = ['heading', 'text', 'image', 'button', 'divider'];
export const EVENT_TYPES: string[] = ['sent', 'open', 'click', 'bounce', 'unsubscribe'];

export type NormalizedBlock =
  | { type: 'heading'; text: string }
  | { type: 'text'; body: string }
  | { type: 'image'; url: string; alt: string }
  | { type: 'button'; label: string; url: string }
  | { type: 'divider' };

const trimmedStr = (raw: unknown): string | null => {
  if (typeof raw !== 'string') {
    return null;
  }
  return raw.trim();
};

export function validateTemplateName(raw: unknown): CampaignVerdict<string> {
  const t = trimmedStr(raw);
  if (t === null || t.length < 1 || t.length > 100) {
    return { ok: false, reason: 'template-invalid-name' };
  }
  return { ok: true, value: t };
}

export function validateSubject(raw: unknown): CampaignVerdict<string> {
  const t = trimmedStr(raw);
  if (t === null || t.length < 1 || t.length > 150) {
    return { ok: false, reason: 'template-invalid-subject' };
  }
  return { ok: true, value: t };
}

// Merge variables follow the Mailchimp merge tag model: {{first_name}} style
// tokens usable in subject lines and body text. Only known variables are
// allowed so typos are refused at save time, not silently ignored.
export function extractVariables(text: string): string[] {
  const out: string[] = [];
  const re = /\{\{\s*([a-z_]+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push(m[1]);
  }
  return out;
}

export function validateTextVariables(raw: unknown): CampaignVerdict<string> {
  if (typeof raw !== 'string') {
    return { ok: false, reason: 'template-invalid-text' };
  }
  const variables = extractVariables(raw);
  for (const variable of variables) {
    if (!ALLOWED_VARIABLES.includes(variable)) {
      return { ok: false, reason: 'template-unknown-variable' };
    }
  }
  return { ok: true, value: raw };
}

function validateBlockUrl(raw: unknown, reason: string): CampaignVerdict<string> {
  if (typeof raw !== 'string') {
    return { ok: false, reason };
  }
  const t = raw.trim();
  if (!t.startsWith('https://') || t.length > 2048 || /\s/.test(t)) {
    return { ok: false, reason };
  }
  return { ok: true, value: t };
}

// Mirrors the drag and drop block model of email template builders: a
// template is an ordered list of blocks, each with its own strict shape.
export function validateBlock(raw: unknown): CampaignVerdict<NormalizedBlock> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, reason: 'template-invalid-block' };
  }
  const block = raw as Record<string, unknown>;
  if (typeof block.type !== 'string' || !BLOCK_TYPES.includes(block.type)) {
    return { ok: false, reason: 'template-invalid-block-type' };
  }
  if (block.type === 'heading') {
    const text = trimmedStr(block.text);
    if (text === null || text.length < 1 || text.length > 200) {
      return { ok: false, reason: 'template-invalid-heading' };
    }
    const vars = validateTextVariables(text);
    if (!vars.ok) {
      return vars;
    }
    return { ok: true, value: { type: 'heading', text } };
  }
  if (block.type === 'text') {
    const body = trimmedStr(block.body);
    if (body === null || body.length < 1 || body.length > 10000) {
      return { ok: false, reason: 'template-invalid-text-block' };
    }
    const vars = validateTextVariables(body);
    if (!vars.ok) {
      return vars;
    }
    return { ok: true, value: { type: 'text', body } };
  }
  if (block.type === 'image') {
    const url = validateBlockUrl(block.url, 'template-invalid-image-url');
    if (!url.ok) {
      return url;
    }
    const alt = trimmedStr(block.alt);
    if (alt === null || alt.length < 1 || alt.length > 200) {
      return { ok: false, reason: 'template-invalid-image-alt' };
    }
    return { ok: true, value: { type: 'image', url: url.value, alt } };
  }
  if (block.type === 'button') {
    const label = trimmedStr(block.label);
    if (label === null || label.length < 1 || label.length > 50) {
      return { ok: false, reason: 'template-invalid-button-label' };
    }
    const vars = validateTextVariables(label);
    if (!vars.ok) {
      return vars;
    }
    const url = validateBlockUrl(block.url, 'template-invalid-button-url');
    if (!url.ok) {
      return url;
    }
    return { ok: true, value: { type: 'button', label, url: url.value } };
  }
  return { ok: true, value: { type: 'divider' } };
}

export function validateBlocks(raw: unknown): CampaignVerdict<NormalizedBlock[]> {
  if (!Array.isArray(raw) || raw.length < 1) {
    return { ok: false, reason: 'template-no-blocks' };
  }
  if (raw.length > 50) {
    return { ok: false, reason: 'template-too-many-blocks' };
  }
  const out: NormalizedBlock[] = [];
  for (const block of raw) {
    const verdict = validateBlock(block);
    if (!verdict.ok) {
      return verdict;
    }
    out.push(verdict.value);
  }
  return { ok: true, value: out };
}

export function substitute(text: string, values: Record<string, string>): CampaignVerdict<string> {
  let out = text;
  for (const variable of ALLOWED_VARIABLES) {
    const token = '{{' + variable + '}}';
    if (out.split(token).length - 1 > 0 && !Object.prototype.hasOwnProperty.call(values, variable)) {
      return { ok: false, reason: 'template-missing-variable' };
    }
  }
  for (const variable of ALLOWED_VARIABLES) {
    const token = '{{' + variable + '}}';
    const replacement = Object.prototype.hasOwnProperty.call(values, variable) ? values[variable] : token;
    out = out.split(token).join(replacement);
  }
  return { ok: true, value: out };
}

function renderBlock(block: NormalizedBlock, values: Record<string, string>): CampaignVerdict<string> {
  if (block.type === 'heading') {
    return substitute(block.text, values);
  }
  if (block.type === 'text') {
    return substitute(block.body, values);
  }
  if (block.type === 'image') {
    return { ok: true, value: '[image: ' + block.alt + '](' + block.url + ')' };
  }
  if (block.type === 'button') {
    const label = substitute(block.label, values);
    if (!label.ok) {
      return label;
    }
    return { ok: true, value: '[button: ' + label.value + '](' + block.url + ')' };
  }
  return { ok: true, value: '---' };
}

export interface RenderTemplateInput {
  subject: unknown;
  blocks: unknown;
  values: Record<string, string>;
}

// Renders a text preview of the template with the merge variables filled in.
// A used variable without a value is refused rather than guessed.
export function renderTemplate(input: RenderTemplateInput): CampaignVerdict<{ subject: string; preview: string }> {
  const subject = validateSubject(input.subject);
  if (!subject.ok) {
    return subject;
  }
  const subjectVars = validateTextVariables(subject.value);
  if (!subjectVars.ok) {
    return subjectVars;
  }
  const blocks = validateBlocks(input.blocks);
  if (!blocks.ok) {
    return blocks;
  }
  const subjectRender = substitute(subject.value, input.values);
  if (!subjectRender.ok) {
    return subjectRender;
  }
  const parts: string[] = [];
  for (const block of blocks.value) {
    const rendered = renderBlock(block, input.values);
    if (!rendered.ok) {
      return rendered;
    }
    parts.push(rendered.value);
  }
  return { ok: true, value: { subject: subjectRender.value, preview: parts.join('\n\n') } };
}

// Publishing is a one-way door, like every publish flow in the system.
export function planPublishTemplate(status: string): CampaignVerdict<string> {
  if (status === 'draft') {
    return { ok: true, value: 'published' };
  }
  if (status === 'published') {
    return { ok: false, reason: 'template-already-published' };
  }
  return { ok: false, reason: 'template-invalid-status' };
}

export function validateEmail(raw: unknown): CampaignVerdict<string> {
  const t = trimmedStr(raw);
  if (t === null || t.length < 5 || t.length > 254 || /\s/.test(t) || (t.split('@').length - 1) !== 1) {
    return { ok: false, reason: 'analytics-invalid-email' };
  }
  const local = t.split('@')[0];
  const domain = t.split('@')[1];
  if (local.length < 1 || domain.length < 3 || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
    return { ok: false, reason: 'analytics-invalid-email' };
  }
  return { ok: true, value: t };
}

export function validateEventType(raw: unknown): CampaignVerdict<string> {
  if (typeof raw === 'string' && EVENT_TYPES.includes(raw)) {
    return { ok: true, value: raw };
  }
  return { ok: false, reason: 'analytics-invalid-event-type' };
}

export interface CampaignMetrics {
  recipients: number;
  sent: number;
  delivered: number;
  opens: number;
  uniqueClicks: number;
  unsubscribes: number;
  bounces: number;
  openRate: number;
  clickRate: number;
  bounceRate: number;
  unsubscribeRate: number;
  deliveryRate: number;
}

const round2 = (x: number): number => Math.round(x * 100) / 100;

// Industry standard formulas: open rate is opens over delivered recipients
// (recipients minus bounces), click rate is unique clicks over delivered,
// bounce rate is bounced recipients over all recipients, unsubscribe rate is
// unsubscribes over delivered. Every rate guards against a zero denominator
// and rounds to two decimals. Opens and clicks are counted per recipient, not
// per event, matching the unique tracking standard.
export function computeCampaignMetrics(events: { email: string; type: string }[]): CampaignMetrics {
  const recipients = new Set<string>();
  const bounced = new Set<string>();
  const opens = new Set<string>();
  const clicks = new Set<string>();
  const unsubs = new Set<string>();
  let sentCount = 0;
  for (const event of events) {
    recipients.add(event.email);
    if (event.type === 'bounce') {
      bounced.add(event.email);
    }
    if (event.type === 'open') {
      opens.add(event.email);
    }
    if (event.type === 'click') {
      clicks.add(event.email);
    }
    if (event.type === 'unsubscribe') {
      unsubs.add(event.email);
    }
    if (event.type === 'sent') {
      sentCount += 1;
    }
  }
  const recipientCount = recipients.size;
  const delivered = recipientCount - bounced.size;
  return {
    recipients: recipientCount,
    sent: sentCount,
    delivered,
    opens: opens.size,
    uniqueClicks: clicks.size,
    unsubscribes: unsubs.size,
    bounces: bounced.size,
    openRate: delivered > 0 ? round2((opens.size / delivered) * 100) : 0,
    clickRate: delivered > 0 ? round2((clicks.size / delivered) * 100) : 0,
    bounceRate: recipientCount > 0 ? round2((bounced.size / recipientCount) * 100) : 0,
    unsubscribeRate: delivered > 0 ? round2((unsubs.size / delivered) * 100) : 0,
    deliveryRate: recipientCount > 0 ? round2((delivered / recipientCount) * 100) : 0,
  };
}
