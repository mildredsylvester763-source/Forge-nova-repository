// ============================================================================
// Pure portal-access engine. A portal session is a secret token tied to one
// customer email; every decision about what that session may see is made
// here with named refusals, and every record handed to a portal visitor is
// redacted to safe fields only.
// ============================================================================

export type Verdict<T> = { ok: true; value: T } | { ok: false; reason: string };

export const PORTAL_RESOURCES = ['invoices', 'quotes'] as const;
export type PortalResource = (typeof PORTAL_RESOURCES)[number];

export const MAX_EMAIL_LENGTH = 254;

export function validateCustomerEmail(email: string): Verdict<string> {
  if (typeof email !== 'string') return { ok: false, reason: 'portal-invalid-email' };
  if (email.length > MAX_EMAIL_LENGTH) return { ok: false, reason: 'portal-email-too-long' };
  const trimmed = email.trim();
  if (trimmed.length === 0) return { ok: false, reason: 'portal-invalid-email' };
  if (trimmed !== email || /\s/.test(email)) return { ok: false, reason: 'portal-invalid-email' };
  const atCount = (trimmed.match(/@/g) || []).length;
  if (atCount !== 1) return { ok: false, reason: 'portal-invalid-email' };
  const parts = trimmed.split('@');
  const local = parts[0];
  const domain = parts[1];
  if (local.length === 0 || domain.length === 0) {
    return { ok: false, reason: 'portal-invalid-email' };
  }
  if (!domain.includes('.')) return { ok: false, reason: 'portal-invalid-email' };
  if (domain.startsWith('.') || domain.endsWith('.')) {
    return { ok: false, reason: 'portal-invalid-email' };
  }
  return { ok: true, value: trimmed };
}

export function validateResource(resource: string): Verdict<PortalResource> {
  if ((PORTAL_RESOURCES as readonly string[]).includes(resource)) {
    return { ok: true, value: resource as PortalResource };
  }
  return { ok: false, reason: 'portal-resource-not-offered' };
}

export function decideSessionUse(status: string): Verdict<{ status: string }> {
  if (status !== 'active') return { ok: false, reason: 'portal-session-revoked' };
  return { ok: true, value: { status } };
}

export interface PortalViewInput {
  sessionStatus: string;
  sessionCustomerEmail: string;
  requestedCustomerEmail: string;
  resource: string;
}

export function decidePortalView(
  input: PortalViewInput,
): Verdict<{ customerEmail: string; resource: PortalResource }> {
  const use = decideSessionUse(input.sessionStatus);
  if (!use.ok) return use;
  const resourceVerdict = validateResource(input.resource);
  if (!resourceVerdict.ok) return resourceVerdict;
  const emailVerdict = validateCustomerEmail(input.requestedCustomerEmail);
  if (!emailVerdict.ok) return { ok: false, reason: 'portal-wrong-customer' };
  if (input.requestedCustomerEmail !== input.sessionCustomerEmail) {
    return { ok: false, reason: 'portal-wrong-customer' };
  }
  return {
    ok: true,
    value: { customerEmail: input.requestedCustomerEmail, resource: resourceVerdict.value },
  };
}

interface AnyRecord {
  [key: string]: unknown;
}

// A portal visitor sees exactly these safe fields. Never internal ids, notes,
// line items, tax internals or any other owner-facing detail.
export function redactInvoice(inv: AnyRecord): Record<string, unknown> {
  return {
    number: inv.number ?? null,
    currency: inv.currency ?? null,
    status: inv.status ?? null,
    totalCents: typeof inv.totalCents === 'number' ? inv.totalCents : 0,
    dueDate: inv.dueDate ?? null,
  };
}

export function redactQuote(q: AnyRecord): Record<string, unknown> {
  return {
    number: q.number ?? null,
    currency: q.currency ?? null,
    status: q.status ?? null,
    totalCents: typeof q.totalCents === 'number' ? q.totalCents : 0,
    validUntil: q.validUntil ?? null,
  };
}
