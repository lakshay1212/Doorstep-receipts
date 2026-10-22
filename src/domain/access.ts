import type { SmartLockAccess, Visit } from '../types.js';
import type { Evaluation } from './visit.js';
import { MINUTE } from './format.js';
import { createHash } from 'node:crypto';

/**
 * Generates or evaluates ephemeral Ring Smart Lock access for a visit.
 * Key Hackathon alignment: Access Control.
 * Only granted if arrival is verified inside the agreed window.
 */
export function evaluateSmartLock(
  v: Visit,
  ev: Evaluation,
  now: number,
): SmartLockAccess {
  // If explicitly revoked by homeowner
  if (v.smartLock && v.smartLock.state === 'revoked') {
    return v.smartLock;
  }

  // Derive a deterministic 4-digit pin from visit ID and windowStart
  const hash = createHash('sha256').update(`${v.id}:${v.windowStart}`).digest('hex');
  const pin = (parseInt(hash.slice(0, 4), 16) % 9000 + 1000).toString();

  const expiresAt = v.departureConfirmedAt ?? (v.windowEnd + (v.lateGraceMin * MINUTE));

  // Access is only ACTIVE if the visit is verified on_time and within the window period
  if (ev.outcome === 'on_time' && now <= expiresAt && !v.departureConfirmedAt) {
    return {
      pin,
      state: 'active',
      issuedAt: ev.arrival ? ev.arrival.at : now,
      expiresAt,
    };
  }

  // If visit completed / departure confirmed or window expired
  if (v.departureConfirmedAt || now > expiresAt) {
    return {
      pin: '••••',
      state: 'locked',
      issuedAt: v.smartLock?.issuedAt ?? v.windowStart,
      expiresAt,
    };
  }

  // Otherwise locked (early, late, or waiting)
  return {
    pin: '••••',
    state: 'locked',
    issuedAt: v.windowStart,
    expiresAt,
  };
}
