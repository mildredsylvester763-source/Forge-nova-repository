import {
  decidePortalView,
  decideSessionUse,
  redactInvoice,
  redactQuote,
  validateCustomerEmail,
  validateResource,
} from './portal-access-engine';

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

describe('portal-access-engine (pinned vectors)', () => {
  it('accepts a normal email and refuses broken ones with named reasons', () => {
    expect(validateCustomerEmail('ann@example.com')).toEqual({ ok: true, value: 'ann@example.com' });
    expect(validateCustomerEmail('ann @example.com')).toEqual({
      ok: false,
      reason: 'portal-invalid-email',
    });
    expect(validateCustomerEmail('annexample.com')).toEqual({
      ok: false,
      reason: 'portal-invalid-email',
    });
    expect(validateCustomerEmail('a@b@example.com')).toEqual({
      ok: false,
      reason: 'portal-invalid-email',
    });
    expect(validateCustomerEmail('ann@example')).toEqual({
      ok: false,
      reason: 'portal-invalid-email',
    });
    expect(validateCustomerEmail('   ')).toEqual({
      ok: false,
      reason: 'portal-invalid-email',
    });
    expect(validateCustomerEmail('a'.repeat(250) + '@example.com')).toEqual({
      ok: false,
      reason: 'portal-email-too-long',
    });
  });

  it('only offers invoices and quotes as portal resources', () => {
    expect(validateResource('invoices')).toEqual({ ok: true, value: 'invoices' });
    expect(validateResource('quotes')).toEqual({ ok: true, value: 'quotes' });
    expect(validateResource('payments')).toEqual({
      ok: false,
      reason: 'portal-resource-not-offered',
    });
  });

  it('refuses anything but an active session', () => {
    expect(decideSessionUse('active')).toEqual({ ok: true, value: { status: 'active' } });
    expect(decideSessionUse('revoked')).toEqual({ ok: false, reason: 'portal-session-revoked' });
  });

  it('approves a matching view and refuses mismatches with named reasons', () => {
    const base = {
      sessionCustomerEmail: 'ann@example.com',
      requestedCustomerEmail: 'ann@example.com',
    };
    expect(decidePortalView({ ...base, sessionStatus: 'active', resource: 'invoices' })).toEqual({
      ok: true,
      value: { customerEmail: 'ann@example.com', resource: 'invoices' },
    });
    expect(
      decidePortalView({ ...base, sessionStatus: 'active', resource: 'invoices', requestedCustomerEmail: 'bob@example.com' }),
    ).toEqual({ ok: false, reason: 'portal-wrong-customer' });
    expect(decidePortalView({ ...base, sessionStatus: 'revoked', resource: 'invoices' })).toEqual({
      ok: false,
      reason: 'portal-session-revoked',
    });
    expect(decidePortalView({ ...base, sessionStatus: 'active', resource: 'payments' })).toEqual({
      ok: false,
      reason: 'portal-resource-not-offered',
    });
  });

  it('redacts records to safe fields only', () => {
    const invoice = redactInvoice({
      id: 'secret-id',
      number: 'INV-0001',
      notes: 'internal note',
      lineItems: [{ description: 'x' }],
      totalCents: 500,
    });
    expect(Object.keys(invoice).sort()).toEqual(
      ['currency', 'dueDate', 'number', 'status', 'totalCents'].sort(),
    );
    const quote = redactQuote({ id: 'secret-id', number: 'QT-0001', customerEmail: 'a@b.com', totalCents: 700 });
    expect(Object.keys(quote).sort()).toEqual(
      ['currency', 'number', 'status', 'totalCents', 'validUntil'].sort(),
    );
  });
});

describe('portal-access-engine (500-case sweep, seed 42)', () => {
  it('never lets a wrong customer, revoked session or unoffered resource through', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const statuses = ['active', 'revoked', 'other'];
      const sessionStatus = statuses[Math.floor(rng() * 3)];
      const resources = ['invoices', 'quotes', 'payments', 'profile', ''];
      const resource = resources[Math.floor(rng() * 5)];
      const sameEmail = rng() < 0.5;
      const requestedCustomerEmail = sameEmail ? 'ann@example.com' : 'bob@example.com';
      const verdict = decidePortalView({
        sessionStatus,
        sessionCustomerEmail: 'ann@example.com',
        requestedCustomerEmail,
        resource,
      });
      const resourceOk = resource === 'invoices' || resource === 'quotes';
      const shouldPass = sessionStatus === 'active' && resourceOk && sameEmail;
      expect(verdict.ok).toBe(shouldPass);
      if (!verdict.ok) {
        expect([
          'portal-session-revoked',
          'portal-resource-not-offered',
          'portal-wrong-customer',
        ]).toContain(verdict.reason);
      }
    }
  });
});
