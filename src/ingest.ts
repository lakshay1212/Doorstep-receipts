import type { Config } from './config.js';
import { routeSignal } from './domain/visit.js';
import { normalizeRingWebhook, PayloadError } from './ring/normalize.js';
import { verifySignature } from './ring/verify.js';
import type { Store } from './store.js';

export interface IngestResult {
  status: 200 | 400 | 401;
  body: Record<string, unknown>;
}

/**
 * The whole webhook pipeline: verify HMAC, parse, dedupe, then keep or discard.
 * Synchronous on purpose: Ring treats anything slower than 5 seconds as a failed delivery.
 */
export function ingestWebhook(
  ctx: { config: Config; store: Store; now: () => number },
  rawBody: Buffer,
  signatureHeader: string | undefined,
): IngestResult {
  if (!verifySignature(ctx.config.signingKey, rawBody, signatureHeader)) {
    return { status: 401, body: { error: 'invalid_signature' } };
  }
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return { status: 400, body: { error: 'invalid_json' } };
  }
  let ev;
  try {
    ev = normalizeRingWebhook(payload);
  } catch (e) {
    if (e instanceof PayloadError) return { status: 400, body: { error: 'invalid_payload', message: e.message } };
    throw e;
  }

  const { db } = ctx.store;
  if (db.seenRequestIds.includes(ev.requestId)) {
    return { status: 200, body: { status: 'duplicate' } };
  }
  db.seenRequestIds.push(ev.requestId);

  let body: Record<string, unknown>;
  if (ev.type === 'device_status') {
    db.deviceLog.push({ deviceId: ev.deviceId, status: ev.status, at: ev.at });
    body = { status: 'processed', kind: 'device_status' };
  } else if (ev.type === 'signal') {
    if (ev.kind === 'motion_other') {
      db.counters.discarded += 1; // we only ever keep doorbell presses and people
      body = { status: 'processed', kept: false, reason: 'not_a_kept_signal_type' };
    } else {
      const attached = routeSignal(
        db,
        { accountId: ev.accountId, deviceId: ev.deviceId, id: ev.eventId, kind: ev.kind, at: ev.at },
        ctx.now(),
      );
      body = { status: 'processed', kept: attached > 0 };
    }
  } else {
    body = { status: 'ignored', reason: ev.reason };
  }
  ctx.store.save();
  return { status: 200, body };
}
