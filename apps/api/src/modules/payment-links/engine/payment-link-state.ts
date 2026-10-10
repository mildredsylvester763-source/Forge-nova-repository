// ============================================================================
// FILE: /apps/api/src/modules/payment-links/engine/payment-link-state.ts
// ============================================================================
// Pure link state machine. No database, no clock — 'now' is passed in.
// Derived states are honest projections, exactly like invoice overdue:
//   expired  <- stored active + past expiresAt
//   consumed <- stored active + uses exhausted (single-use or maxUses)
// The stored status itself only holds 'active' or 'canceled', but the pure
// engine tolerates a stored 'consumed' flag from legacy or hand-built data.

export type EffectiveLinkStatus = 'active' | 'consumed' | 'expired' | 'canceled';

export interface LinkLike {
  status: 'active' | 'canceled' | 'consumed';
  singleUse: boolean;
  expiresAt?: Date | null;
  amountCents?: number | null;
  maxUses?: number | null;
  uses?: number;
}

export function effectiveLinkStatus(link: LinkLike, now: Date): EffectiveLinkStatus {
  if (link.status === 'canceled') {
    return 'canceled';
  }
  if (link.status === 'consumed') {
    return 'consumed';
  }
  if (link.expiresAt && now.getTime() > link.expiresAt.getTime()) {
    return 'expired';
  }
  if (link.singleUse && (link.uses ?? 0) >= 1) {
    return 'consumed';
  }
  if (link.maxUses !== undefined && link.maxUses !== null && (link.uses ?? 0) >= link.maxUses) {
    return 'consumed';
  }
  return 'active';
}

export interface ConsumeVerdict {
  allowed: boolean;
  reason: string;
}

/**
 * Can a customer pay through this link right now? When amountCents is given
 * (partial/custom payments), the payment may never exceed the locked amount.
 */
export function canConsumeLink(
  link: LinkLike,
  now: Date,
  amountCents?: number,
): ConsumeVerdict {
  const eff = effectiveLinkStatus(link, now);
  if (eff === 'consumed') {
    return { allowed: false, reason: 'this payment link has already been used' };
  }
  if (eff === 'canceled') {
    return { allowed: false, reason: 'this payment link was canceled' };
  }
  if (eff === 'expired') {
    return { allowed: false, reason: 'this payment link has expired' };
  }
  if (amountCents !== undefined) {
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      return { allowed: false, reason: 'payment amount must be positive integer cents' };
    }
    if (link.amountCents !== undefined && link.amountCents !== null && amountCents > link.amountCents) {
      return {
        allowed: false,
        reason: 'payment of ' + amountCents + ' exceeds the link amount of ' + link.amountCents,
      };
    }
  }
  return { allowed: true, reason: 'link is open for payment' };
}
