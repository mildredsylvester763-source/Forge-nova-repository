import {
  ENVIRONMENTS,
  evaluateStep,
  isEnvironment,
  resolveSafeMode,
} from './safe-mode';

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('safe mode engine (FORGE TQ-030)', () => {
  it('forces safe mode on for production, honors the request elsewhere', () => {
    expect(resolveSafeMode(false, 'production')).toEqual({ safeMode: true, forced: true });
    expect(resolveSafeMode(true, 'production')).toEqual({ safeMode: true, forced: true });
    expect(resolveSafeMode(false, 'staging')).toEqual({ safeMode: false, forced: false });
    expect(resolveSafeMode(undefined, 'test')).toEqual({ safeMode: true, forced: false });
    expect(resolveSafeMode('weird', 'bogus').safeMode).toBe(true);
    expect(ENVIRONMENTS).toEqual(['dev', 'test', 'staging', 'production']);
    expect(isEnvironment('production')).toBe(true);
    expect(isEnvironment('prod')).toBe(false);
  });

  it('blocks destructive, payment and message intents by name', () => {
    expect(evaluateStep({ action: 'delete' }, true)).toEqual({
      ok: false,
      reason: 'safe-mode-blocks-destructive:delete',
    });
    expect(evaluateStep({ action: 'wipe' }, true)).toEqual({
      ok: false,
      reason: 'safe-mode-blocks-destructive:wipe',
    });
    expect(evaluateStep({ action: 'purchase' }, true)).toEqual({
      ok: false,
      reason: 'safe-mode-blocks-payment:purchase',
    });
    expect(evaluateStep({ action: 'send-email' }, true)).toEqual({
      ok: false,
      reason: 'safe-mode-blocks-real-message:send-email',
    });
    expect(evaluateStep({ action: 'BUY' }, true)).toEqual({
      ok: false,
      reason: 'safe-mode-blocks-payment:buy',
    });
  });

  it('blocks real addresses in payloads but passes clean steps', () => {
    expect(evaluateStep({ action: 'type', payload: { value: 'user@example.com' } }, true)).toEqual({
      ok: false,
      reason: 'safe-mode-blocks-real-address:type',
    });
    expect(evaluateStep({ action: 'click', target: 'cart button' }, true)).toEqual({ ok: true });
    expect(evaluateStep({ action: 'type', payload: { value: 'hello world' } }, true)).toEqual({
      ok: true,
    });
    expect(evaluateStep({ action: '' }, true)).toEqual({
      ok: false,
      reason: 'safe-mode-action-missing',
    });
  });

  it('lets the same intents through when safe mode is off', () => {
    expect(evaluateStep({ action: 'delete' }, false)).toEqual({ ok: true });
    expect(evaluateStep({ action: 'pay' }, false)).toEqual({ ok: true });
    expect(
      evaluateStep({ action: 'type', payload: { value: 'user@example.com' } }, false),
    ).toEqual({ ok: true });
  });

  it('500-case sweep: pools always block, innocents always pass', () => {
    const rand = mulberry32(42);
    const pool = [
      'delete', 'wipe', 'purge', 'drop', 'erase', 'format', 'uninstall',
      'pay', 'purchase', 'checkout', 'buy', 'subscribe', 'charge', 'billing',
      'send-message', 'send-email', 'send-sms', 'invite', 'post', 'publish', 'share',
      'click', 'type', 'scroll', 'navigate', 'wait', 'assert', 'hover', 'zzz',
    ];
    const addresses = ['a@b.co', 'someone@site.org', 'x123@sub.io'];
    for (let i = 0; i < 500; i++) {
      const action = pool[Math.floor(rand() * pool.length)];
      const safeMode = rand() < 0.7;
      const withAddress = rand() < 0.4;
      const payload = withAddress
        ? { value: addresses[Math.floor(rand() * addresses.length)] }
        : { value: 'plain text number ' + i };
      const v = evaluateStep({ action, payload }, safeMode);
      if (!safeMode) {
        expect(v.ok).toBe(true);
        continue;
      }
      const a = action.trim().toLowerCase();
      const poolAction =
        v.reason === 'safe-mode-blocks-destructive:' + a ||
        v.reason === 'safe-mode-blocks-payment:' + a ||
        v.reason === 'safe-mode-blocks-real-message:' + a;
      if (poolAction) {
        expect(v.ok).toBe(false);
      } else if (withAddress) {
        expect(v).toEqual({ ok: false, reason: 'safe-mode-blocks-real-address:' + a });
      } else {
        expect(v.ok).toBe(true);
      }
    }
  });
});
