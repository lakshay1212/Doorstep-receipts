import type { NormalizedRingEvent } from '../types.js';

export class PayloadError extends Error {}

function text(v: unknown, name: string): string {
  if (typeof v !== 'string' || v.length === 0) throw new PayloadError(`Missing ${name}`);
  return v;
}

/**
 * Turn a Ring webhook v1.1 payload into an internal event.
 *
 * Shape per the Ring Partner API docs:
 *   meta: { version, time, request_id, account_id }
 *   data: { id, type, subType?, attributes: { source, source_type, timestamp } }
 * Event types: motion_detected, button_press, device_added, device_removed,
 *              device_online, device_offline (plus integration/subscription events).
 */
export function normalizeRingWebhook(payload: unknown): NormalizedRingEvent {
  const p = payload as { meta?: Record<string, unknown>; data?: Record<string, unknown> } | null;
  if (!p || typeof p !== 'object' || !p.meta || !p.data) {
    throw new PayloadError('Expected { meta, data }');
  }
  const meta = p.meta;
  const data = p.data;
  const requestId = text(meta.request_id, 'meta.request_id');
  const accountId = text(meta.account_id, 'meta.account_id');
  const type = text(data.type, 'data.type');
  const attrs = (data.attributes ?? {}) as Record<string, unknown>;

  const sentAt = typeof meta.time === 'string' ? Date.parse(meta.time) : NaN;
  const eventTs = typeof attrs.timestamp === 'number' ? attrs.timestamp : NaN;

  if (type === 'button_press' || type === 'motion_detected') {
    const deviceId = text(attrs.source, 'data.attributes.source');
    if (!Number.isFinite(eventTs)) throw new PayloadError('Missing data.attributes.timestamp');
    const sub = String(data.subType ?? attrs.subType ?? attrs.sub_type ?? '').toLowerCase();
    const kind =
      type === 'button_press' ? 'button_press' : sub === 'human' ? 'motion_human' : 'motion_other';
    const eventId = typeof data.id === 'string' && data.id ? data.id : `${deviceId}_${kind}_${eventTs}`;
    return { type: 'signal', requestId, accountId, deviceId, eventId, kind, at: eventTs };
  }

  if (type === 'device_online' || type === 'device_offline') {
    const deviceId = text(attrs.source, 'data.attributes.source');
    const at = Number.isFinite(eventTs) ? eventTs : sentAt;
    if (!Number.isFinite(at)) throw new PayloadError('Missing timestamp');
    return {
      type: 'device_status',
      requestId,
      accountId,
      deviceId,
      status: type === 'device_online' ? 'online' : 'offline',
      at,
    };
  }

  return { type: 'ignored', requestId, accountId, reason: `Unhandled event type: ${type}` };
}
