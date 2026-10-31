// ============================================================================
// Pure supplier-record engine. Follows the supplier features the SMB
// inventory market (Zoho Inventory, inFlow, QuickBooks) ships: a named
// supplier, optional contact details, and a lead time in days that feeds
// purchase-order planning. Every refusal is named.
// ============================================================================

export type Verdict<T> = { ok: true; value: T } | { ok: false; reason: string };

export const SUPPLIER_NAME_MAX = 80;
export const SUPPLIER_NOTES_MAX = 500;

export function validateSupplierName(name: unknown): Verdict<string> {
  if (typeof name !== 'string') return { ok: false, reason: 'supplier-invalid-name' };
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > SUPPLIER_NAME_MAX) {
    return { ok: false, reason: 'supplier-invalid-name' };
  }
  return { ok: true, value: trimmed };
}

export function validateEmail(email: string | null | undefined): Verdict<string | null> {
  if (email === null || email === undefined || email === '') return { ok: true, value: null };
  if (typeof email !== 'string' || email.length > 120) {
    return { ok: false, reason: 'supplier-invalid-email' };
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, reason: 'supplier-invalid-email' };
  }
  return { ok: true, value: email.trim() };
}

export function validatePhone(phone: string | null | undefined): Verdict<string | null> {
  if (phone === null || phone === undefined || phone === '') return { ok: true, value: null };
  if (typeof phone !== 'string') return { ok: false, reason: 'supplier-invalid-phone' };
  const trimmed = phone.trim();
  if (trimmed.length < 7 || trimmed.length > 20) {
    return { ok: false, reason: 'supplier-invalid-phone' };
  }
  if (!/^[+0-9][0-9\s()+-]*$/.test(trimmed)) {
    return { ok: false, reason: 'supplier-invalid-phone' };
  }
  return { ok: true, value: trimmed };
}

export function validateAddress(address: string | null | undefined): Verdict<string | null> {
  if (address === null || address === undefined || address === '') return { ok: true, value: null };
  if (typeof address !== 'string') return { ok: false, reason: 'supplier-invalid-address' };
  const trimmed = address.trim();
  if (trimmed.length < 1 || trimmed.length > 200) {
    return { ok: false, reason: 'supplier-invalid-address' };
  }
  return { ok: true, value: trimmed };
}

export function validateLeadTimeDays(days: number | null | undefined): Verdict<number> {
  const value = days === null || days === undefined ? 0 : days;
  if (!Number.isInteger(value) || value < 0 || value > 365) {
    return { ok: false, reason: 'supplier-invalid-lead-time' };
  }
  return { ok: true, value };
}

export function validateNotes(notes: string | null | undefined): Verdict<string | null> {
  if (notes === null || notes === undefined || notes === '') return { ok: true, value: null };
  if (typeof notes !== 'string' || notes.trim().length > SUPPLIER_NOTES_MAX) {
    return { ok: false, reason: 'supplier-notes-too-long' };
  }
  return { ok: true, value: notes.trim() };
}

export interface SupplierDraft {
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  leadTimeDays: number;
  notes: string | null;
}

export interface SupplierInput {
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  leadTimeDays?: number | null;
  notes?: string | null;
}

export function normalizeSupplier(input: SupplierInput): Verdict<SupplierDraft> {
  const name = validateSupplierName(input.name);
  if (!name.ok) return name;
  const email = validateEmail(input.email);
  if (!email.ok) return email;
  const phone = validatePhone(input.phone);
  if (!phone.ok) return phone;
  const address = validateAddress(input.address);
  if (!address.ok) return address;
  const leadTime = validateLeadTimeDays(input.leadTimeDays);
  if (!leadTime.ok) return leadTime;
  const notes = validateNotes(input.notes);
  if (!notes.ok) return notes;
  return {
    ok: true,
    value: {
      name: name.value,
      email: email.value,
      phone: phone.value,
      address: address.value,
      leadTimeDays: leadTime.value,
      notes: notes.value,
    },
  };
}
