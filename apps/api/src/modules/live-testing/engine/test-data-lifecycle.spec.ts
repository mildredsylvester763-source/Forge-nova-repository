import { FIXTURE_DOMAIN, checkCleanup, deriveTestAccounts } from './test-data-lifecycle';

describe('test data lifecycle engine', () => {
  it('derives deterministic fixture accounts from a seed', () => {
    const first = deriveTestAccounts('checkout-flow', 2);
    expect(first.ok).toBe(true);
    expect(first.domain).toBe(FIXTURE_DOMAIN);
    expect(first.accounts).toHaveLength(2);
    expect(first.accounts?.map((a) => a.username)).toEqual([
      'forge-checkoutflow-1',
      'forge-checkoutflow-2',
    ]);
    expect(first.accounts?.map((a) => a.email)).toEqual([
      'forge-checkoutflow-1@forgelocal.test',
      'forge-checkoutflow-2@forgelocal.test',
    ]);
    expect(first.accounts?.map((a) => a.role)).toEqual(['shopper', 'editor']);
    const second = deriveTestAccounts('checkout-flow', 2);
    expect(second.accounts).toEqual(first.accounts);
    const other = deriveTestAccounts('signup-flow', 2);
    expect(other.accounts?.[0].password).not.toBe(first.accounts?.[0].password);
  });

  it('pins the password shape and the default count', () => {
    const v = deriveTestAccounts('checkout-flow');
    expect(v.accounts).toHaveLength(3);
    expect(v.accounts?.map((a) => a.role)).toEqual(['shopper', 'editor', 'viewer']);
    for (const a of v.accounts ?? []) {
      expect(/^[a-zA-Z0-9]{12}$/.test(a.password)).toBe(true);
      expect(/[a-z]/.test(a.password)).toBe(true);
      expect(/[A-Z]/.test(a.password)).toBe(true);
      expect(/[0-9]/.test(a.password)).toBe(true);
      expect(a.email.endsWith('@forgelocal.test')).toBe(true);
    }
  });

  it('pins the slug fallback and the seed caps', () => {
    let v = deriveTestAccounts('!!!', 1);
    expect(v.accounts?.[0].username).toBe('forge-session-1');
    v = deriveTestAccounts('a'.repeat(40), 1);
    expect(v.accounts?.[0].username).toBe('forge-aaaaaaaaaaaa-1');
  });

  it('refuses empty seeds and counts outside the law by name', () => {
    let v = deriveTestAccounts('', 2);
    expect(v.reason).toBe('data-seed-missing');
    v = deriveTestAccounts('x', 0);
    expect(v.reason).toBe('data-count-invalid:0');
    v = deriveTestAccounts('x', 13);
    expect(v.reason).toBe('data-count-invalid:13');
    v = deriveTestAccounts('x', 1.5);
    expect(v.reason).toBe('data-count-invalid:1.5');
    v = deriveTestAccounts('x', 12);
    expect(v.ok).toBe(true);
    expect(v.accounts).toHaveLength(12);
  });

  it('pins the cleanup plan, idempotency and terminal-only law', () => {
    let c = checkCleanup({ status: 'completed', pending: 3, cleaned: 1 });
    expect(c.ok).toBe(true);
    expect(c.alreadyClean).toBe(false);
    expect(c.plan).toEqual([
      'disable fixtures',
      'purge seeded uploads',
      'restore app settings',
      'remove test accounts',
    ]);
    expect(c.pending).toBe(3);
    expect(c.cleaned).toBe(1);
    c = checkCleanup({ status: 'cancelled', pending: 0, cleaned: 4 });
    expect(c.alreadyClean).toBe(true);
    expect(c.plan).toEqual([]);
    expect(c.pending).toBe(0);
    c = checkCleanup({ status: 'failed', pending: 2, cleaned: 0 });
    expect(c.ok).toBe(true);
    c = checkCleanup({ status: 'running', pending: 2, cleaned: 0 });
    expect(c.reason).toBe('data-cleanup-status-refused:running');
    c = checkCleanup({ status: 'paused', pending: 2, cleaned: 0 });
    expect(c.reason).toBe('data-cleanup-status-refused:paused');
    c = checkCleanup({ status: '', pending: 0, cleaned: 0 });
    expect(c.reason).toBe('data-status-missing');
    c = checkCleanup({ status: 'completed', pending: -1, cleaned: 0 });
    expect(c.reason).toBe('data-pending-invalid:-1');
    c = checkCleanup({ status: 'completed', pending: 1, cleaned: -2 });
    expect(c.reason).toBe('data-cleaned-invalid:-2');
  });

  it('survives a 500-seed determinism sweep', () => {
    for (let i = 0; i < 500; i++) {
      const seed = 'seed-' + i;
      const a = deriveTestAccounts(seed, 3);
      const b = deriveTestAccounts(seed, 3);
      expect(a.ok).toBe(true);
      expect(a.accounts).toEqual(b.accounts);
      const names = (a.accounts ?? []).map((x) => x.username);
      expect(new Set(names).size).toBe(3);
      for (const acc of a.accounts ?? []) {
        expect(acc.email.endsWith('@forgelocal.test')).toBe(true);
        expect(/^[a-zA-Z0-9]{12}$/.test(acc.password)).toBe(true);
      }
    }
  });
});
