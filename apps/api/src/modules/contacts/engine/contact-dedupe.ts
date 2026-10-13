// ============================================================================
// FILE: /apps/api/src/modules/contacts/engine/contact-dedupe.ts
// ============================================================================
// Pure identity math. Normalizing '  Acme Corp., Ltd. ' and 'acme corp ltd'
// to the same key is the whole point: duplicates are refused at the engine
// level with the key visible in the reason.

export function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function normalizeEmail(email?: string | null): string | null {
  if (!email) return null;
  const e = email.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

export function dedupeKeyFor(contact: { name: string; email?: string | null }): string {
  const e = normalizeEmail(contact.email);
  if (e) return 'email:' + e;
  return 'name:' + normalizeName(contact.name);
}

export function findDuplicate(existing: { dedupeKey: string }[], key: string): boolean {
  return existing.some((c) => c.dedupeKey === key);
}
