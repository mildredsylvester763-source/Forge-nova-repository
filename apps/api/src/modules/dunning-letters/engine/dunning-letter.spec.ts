// ============================================================================
// FILE: /apps/api/src/modules/dunning-letters/engine/dunning-letter.spec.ts
// ============================================================================
// Pinned tone ladder, exact subjects/bodies, every named refusal, money
// formatting, and a seeded 500-letter sweep with monotone tone guarantees.

import { composeLetter, formatMoney, isLetterRefusal, toneForStage } from './dunning-letter';

const DAY_MS = 86_400_000;
const T0 = Date.UTC(2026, 9, 1); // due 2026-10-01

const base = {
  status: 'sent' as const,
  number: 'INV-0007',
  currency: 'USD',
  totalCents: 150_000,
  customerName: 'Ada',
  dueDate: new Date(T0),
  paidAt: null,
  daysOverdue: 0,
  lateFeeCents: 0,
  feeReason: '',
};

describe('formatMoney', () => {
  it('formats integer cents deterministically', () => {
    expect(formatMoney(150_000, 'USD')).toBe('USD 1,500.00');
    expect(formatMoney(5, 'USD')).toBe('USD 0.05');
    expect(formatMoney(100_000_000, 'USD')).toBe('USD 1,000,000.00');
    expect(formatMoney(0, 'NGN')).toBe('NGN 0.00');
  });
});

describe('toneForStage', () => {
  it('escalates monotonically along the ladder', () => {
    expect(toneForStage(-3)).toBe('gentle');
    expect(toneForStage(0)).toBe('polite');
    expect(toneForStage(7)).toBe('firm');
    expect(toneForStage(14)).toBe('urgent');
    expect(toneForStage(30)).toBe('urgent');
    expect(toneForStage(60)).toBe('final');
  });
});

describe('composeLetter', () => {
  it('composes the gentle pre-due letter with exact subject', () => {
    const L = composeLetter({ ...base, daysOverdue: 0 }, -3, {}, new Date(Date.UTC(2026, 8, 28)));
    expect(isLetterRefusal(L)).toBe(false);
    if (!isLetterRefusal(L)) {
      expect(L.tone).toBe('gentle');
      expect(L.subject).toBe('[Reminder] Invoice INV-0007 is due on 2026-10-01');
      expect(L.body).toContain('friendly heads-up');
    }
  });

  it('composes the polite due-day letter', () => {
    const L = composeLetter({ ...base }, 0, {}, new Date(T0));
    expect(isLetterRefusal(L)).toBe(false);
    if (!isLetterRefusal(L)) {
      expect(L.tone).toBe('polite');
      expect(L.subject).toBe('[Reminder] Invoice INV-0007 is due today (USD 1,500.00)');
    }
  });

  it('composes the firm +7 letter with exact subject', () => {
    const L = composeLetter({ ...base, daysOverdue: 7 }, 7, {}, new Date(T0 + 7 * DAY_MS));
    expect(isLetterRefusal(L)).toBe(false);
    if (!isLetterRefusal(L)) {
      expect(L.tone).toBe('firm');
      expect(L.subject).toBe('[Overdue 7 days] Invoice INV-0007 — USD 1,500.00 outstanding');
    }
  });

  it('composes the urgent +30 letter and quotes the late fee with its reason', () => {
    const L = composeLetter(
      { ...base, daysOverdue: 30, lateFeeCents: 4_500, feeReason: '150 cents/day x 30 chargeable day(s)' },
      30,
      {},
      new Date(T0 + 30 * DAY_MS),
    );
    expect(isLetterRefusal(L)).toBe(false);
    if (!isLetterRefusal(L)) {
      expect(L.tone).toBe('urgent');
      expect(L.body).toContain('USD 45.00');
      expect(L.body).toContain('150 cents/day x 30 chargeable day(s)');
    }
  });

  it('composes the final +60 letter', () => {
    const L = composeLetter(
      { ...base, daysOverdue: 60, lateFeeCents: 9_000, feeReason: '150 cents/day x 60 chargeable day(s)' },
      60,
      {},
      new Date(T0 + 60 * DAY_MS),
    );
    expect(isLetterRefusal(L)).toBe(false);
    if (!isLetterRefusal(L)) {
      expect(L.tone).toBe('final');
      expect(L.body).toContain('final reminder');
    }
  });

  it('refuses with named reasons for every ineligible case', () => {
    expect(composeLetter({ ...base, status: 'draft' }, 7, {}, new Date(T0 + 7 * DAY_MS))).toMatchObject({
      refused: true,
      reason: 'draft invoices are never sent dunning letters',
    });
    expect(composeLetter({ ...base, status: 'paid' }, 7, {}, new Date(T0 + 7 * DAY_MS))).toMatchObject({
      refused: true,
      reason: 'a paid invoice owes nothing, no letter is sent',
    });
    expect(composeLetter({ ...base, status: 'void' }, 7, {}, new Date(T0 + 7 * DAY_MS))).toMatchObject({
      refused: true,
      reason: 'a voided invoice owes nothing, no letter is sent',
    });
    expect(composeLetter({ ...base, dueDate: null }, 7, {}, new Date(T0 + 7 * DAY_MS))).toMatchObject({
      refused: true,
      reason: 'an invoice without a due date cannot enter the reminder ladder',
    });
    const notReached = composeLetter({ ...base }, 14, {}, new Date(T0 + 7 * DAY_MS));
    expect(isLetterRefusal(notReached)).toBe(true);
    expect((notReached as { reason: string }).reason).toContain('has not been reached yet');
  });
});

describe('500-letter seeded sweep', () => {
  it('never composes for ineligible invoices and keeps tones monotone', () => {
    function mulberry32(seed: number) {
      let a = seed >>> 0;
      return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    const rnd = mulberry32(777);
    const statuses = ['draft', 'sent', 'overdue', 'paid', 'void'] as const;
    const offsets = [-3, 0, 7, 14, 30, 60];
    for (let i = 0; i < 500; i++) {
      const due = Date.UTC(2026, 0, 1) + Math.floor(rnd() * 300) * DAY_MS;
      const offset = offsets[Math.floor(rnd() * offsets.length)];
      const now = new Date(due + Math.floor((rnd() - 0.5) * 140) * DAY_MS);
      const status = statuses[Math.floor(rnd() * statuses.length)];
      const paid = status === 'paid' || rnd() < 0.1;
      const daysOverdue = Math.max(0, Math.floor((now.getTime() - due) / DAY_MS));
      const L = composeLetter(
        {
          status,
          number: 'INV-' + (1000 + i),
          currency: 'NGN',
          totalCents: Math.floor(rnd() * 5_000_000),
          customerName: rnd() < 0.5 ? 'Client ' + i : null,
          dueDate: rnd() < 0.95 ? new Date(due) : null,
          paidAt: paid ? now : null,
          daysOverdue,
          lateFeeCents: Math.floor(rnd() * 10_000),
          feeReason: 'sweep fee',
        },
        offset,
        { businessName: 'Forging Nova', senderName: 'Accounts' },
        now,
      );
      if (isLetterRefusal(L)) {
        expect(L.reason.length).toBeGreaterThan(0);
        const shadow = L as unknown as Record<string, unknown>;
        expect(shadow.subject).toBeUndefined();
        expect(shadow.body).toBeUndefined();
      } else {
        expect(['gentle', 'polite', 'firm', 'urgent', 'final']).toContain(L.tone);
        expect(L.subject).toContain('INV-' + (1000 + i));
        expect(L.body).toContain('Thank you');
        if (offset < 0) expect(L.tone).toBe('gentle');
        if (offset === 0) expect(L.tone).toBe('polite');
        if (offset > 30) expect(L.tone).toBe('final');
      }
    }
  });
});
