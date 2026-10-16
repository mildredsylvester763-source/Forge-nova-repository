// ============================================================================
// FILE: /apps/api/src/modules/agent/engine/invoice-draft.ts
// ============================================================================

// Turns free text into a draft invoice: customer name from the lead-in,
// line items from quantity/description/price fragments in any of the
// three pinned grammars. Text with no recognizable lines is a named
// refusal — the agent never invents a blank invoice.

export type Verdict<T> = { ok: true; value: T } | { ok: false; reason: string };

export interface DraftLine {
  quantity: number;
  description: string;
  unitPriceCents: number;
}

export interface InvoiceDraft {
  customerName: string | null;
  lines: DraftLine[];
  totalCents: number;
}

// "3 web design at 50000" (also "for", "@", "x" as connectors)
const R1 = /^(\d+)\s+(.+?)\s+(?:at|for|@|x\s*)\s*(₦?\$?[\d,.]+)$/;
// "2 x 30000 advisory"
const R2 = /^(\d+)\s*(?:x|×)\s*(₦?\$?[\d,.]+)\s+(.+)$/;
// "logo 20000" — bare description with a trailing price
const TAIL = /^(.+?)\s+(₦?\$?\d[\d,.]*)$/;
const CUSTOMER_RE = /invoice\s+(?:for\s+)?([A-Za-z][\w&.'-]*(?:\s+[A-Za-z][\w&.'-]*)*)/;

function priceToCents(raw: string): number {
  const numeric = parseFloat(raw.replace(/[₦$,\s]/g, ''));
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return Math.round(numeric * 100);
}

export function draftInvoiceFromText(text: string): Verdict<InvoiceDraft> {
  if (typeof text !== 'string' || !text.trim()) return { ok: false, reason: 'draft-empty-text' };

  let customerName: string | null = null;
  const customerMatch = text.match(CUSTOMER_RE);
  if (customerMatch) customerName = customerMatch[1].replace(/\.$/, '').trim();

  const lines: DraftLine[] = [];
  const segments = text.split(/\n|;|(?:,\s)/).map((s) => s.trim()).filter(Boolean);
  for (const segment of segments) {
    const m1 = segment.match(R1);
    if (m1) {
      lines.push({
        quantity: parseInt(m1[1], 10),
        description: m1[2].trim(),
        unitPriceCents: priceToCents(m1[3]),
      });
      continue;
    }
    const m2 = segment.match(R2);
    if (m2) {
      lines.push({
        quantity: parseInt(m2[1], 10),
        description: m2[3].trim(),
        unitPriceCents: priceToCents(m2[2]),
      });
      continue;
    }
    const mt = segment.match(TAIL);
    if (mt && !/^(?:at|for|@|x)$/i.test(mt[1])) {
      lines.push({
        quantity: 1,
        description: mt[1].trim(),
        unitPriceCents: priceToCents(mt[2]),
      });
    }
  }

  if (!lines.length) return { ok: false, reason: 'draft-no-lines' };

  const totalCents = lines.reduce((sum, line) => sum + line.quantity * line.unitPriceCents, 0);
  return { ok: true, value: { customerName, lines, totalCents } };
}
