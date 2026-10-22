import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Visit } from '../types.js';
import type { Evaluation } from './visit.js';

export interface VerificationSeal {
  algorithm: 'HMAC-SHA256';
  canonicalManifest: string;
  digest: string;
  fingerprint: string;
  verified: boolean;
  certifiedAt: string;
}

export interface IntegrityCheckResult {
  verified: boolean;
  algorithm: 'HMAC-SHA256';
  computedDigest: string;
  expectedDigest: string;
  canonicalManifest: string;
  failureReason?: string;
}

/**
 * Builds the canonical representation of the immutable receipt facts.
 * Formatted deterministically to prevent whitespace or encoding discrepancies.
 */
export function buildCanonicalManifest(v: Visit, ev: Evaluation): string {
  const signalFingerprint = v.signals
    .filter((s) => !s.excluded)
    .map((s) => `${s.kind}@${s.at}`)
    .sort()
    .join(',');

  return [
    `v1`,
    `visit:${v.id}`,
    `contractor:${v.contractor}`,
    `window:${v.windowStart}-${v.windowEnd}`,
    `outcome:${ev.outcome}`,
    `arrival:${ev.arrival ? `${ev.arrival.at}:${ev.arrival.via}` : 'none'}`,
    `offline_min:${ev.offlineMinutes}`,
    `departure:${v.departureConfirmedAt ?? 'unconfirmed'}`,
    `signals:${signalFingerprint || 'none'}`,
  ].join('|');
}

/**
 * Signs the canonical evidence record using the backend HMAC key.
 * Only the webhook backend holds the signing key, preventing tampering.
 */
export function generateVerificationSeal(
  v: Visit,
  ev: Evaluation,
  signingKey: string,
): VerificationSeal {
  const canonicalManifest = buildCanonicalManifest(v, ev);
  const key = signingKey || 'ring-receipt-seal';
  const digest = createHmac('sha256', key).update(canonicalManifest).digest('hex');

  return {
    algorithm: 'HMAC-SHA256',
    canonicalManifest,
    digest,
    fingerprint: `${digest.slice(0, 8)}...${digest.slice(-8)}`,
    verified: true,
    certifiedAt: new Date(ev.arrival?.at ?? v.createdAt).toISOString(),
  };
}

/**
 * Cryptographically verifies an evidence record against its reference seal.
 * Detects any unauthorized modification to timestamps, outcomes, or signals.
 */
export function verifyEvidenceIntegrity(
  v: Visit,
  ev: Evaluation,
  expectedDigest: string,
  signingKey: string,
): IntegrityCheckResult {
  const canonicalManifest = buildCanonicalManifest(v, ev);
  const key = signingKey || 'ring-receipt-seal';
  const computedDigest = createHmac('sha256', key).update(canonicalManifest).digest('hex');

  const bufA = Buffer.from(computedDigest, 'utf8');
  const bufB = Buffer.from(expectedDigest || '', 'utf8');

  const matches = bufA.length === bufB.length && timingSafeEqual(bufA, bufB);

  return {
    verified: matches,
    algorithm: 'HMAC-SHA256',
    computedDigest,
    expectedDigest,
    canonicalManifest,
    failureReason: matches
      ? undefined
      : 'Cryptographic mismatch: Evidence record has been altered or signature does not match canonical Ring telemetry.',
  };
}
