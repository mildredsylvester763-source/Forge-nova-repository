// ============================================================================
// FILE: /apps/api/src/modules/referrals/engine/referral-engine.ts
// ============================================================================
// The referral engine: pure code generation, code validation and reward
// decisions. The alphabet has no letters humans misread (I, L, O, 0, 1).
// The rng is injected so tests are deterministic. Every refusal is named.

export type Verdict<T> = { ok: true; value: T } | { ok: false; reason: string };

export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 8;
export const REWARD_POINTS = 500;

export function buildCode(rng: () => number): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)];
  }
  return code;
}

export function validateCode(raw: unknown): Verdict<{ code: string }> {
  if (typeof raw !== 'string') {
    return { ok: false, reason: 'referral-invalid-code' };
  }
  const code = raw.trim().toUpperCase();
  if (code.length !== CODE_LENGTH) {
    return { ok: false, reason: 'referral-invalid-length' };
  }
  if (code.split('').some((c) => CODE_ALPHABET.indexOf(c) < 0)) {
    return { ok: false, reason: 'referral-invalid-characters' };
  }
  return { ok: true, value: { code } };
}

export function decideReward(input: {
  referrerId: unknown;
  refereeId: unknown;
  bindingExists: boolean;
  alreadyRewarded: boolean;
  purchaseCents: unknown;
}): Verdict<{ points: number }> {
  if (
    typeof input.referrerId !== 'string' ||
    !input.referrerId.length ||
    typeof input.refereeId !== 'string' ||
    !input.refereeId.length
  ) {
    return { ok: false, reason: 'referral-invalid-identity' };
  }
  if (input.referrerId === input.refereeId) {
    return { ok: false, reason: 'referral-self-referral' };
  }
  if (!input.bindingExists) {
    return { ok: false, reason: 'referral-not-bound' };
  }
  if (input.alreadyRewarded) {
    return { ok: false, reason: 'referral-already-rewarded' };
  }
  if (
    typeof input.purchaseCents !== 'number' ||
    !Number.isInteger(input.purchaseCents) ||
    input.purchaseCents < 1
  ) {
    return { ok: false, reason: 'referral-invalid-purchase' };
  }
  return { ok: true, value: { points: REWARD_POINTS } };
}
