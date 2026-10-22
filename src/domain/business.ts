import { randomUUID } from 'node:crypto';
import type { BusinessWebhookEvent, Visit } from '../types.js';
import type { Evaluation } from './visit.js';

export type PlatformTarget = 'Jobber' | 'Stripe' | 'Housecall Pro' | 'Custom';

export function createBusinessEvent(
  v: Visit,
  ev: Evaluation,
  platform: PlatformTarget,
  now: number,
): BusinessWebhookEvent {
  let eventType: BusinessWebhookEvent['eventType'];
  let payloadDetails: Record<string, unknown> = {};

  if (ev.outcome === 'on_time') {
    eventType = 'arrival.verified';
    payloadDetails = {
      action: 'release_escrow_deposit',
      contractor: v.contractor,
      job: v.title,
      arrival_time: ev.arrival?.at ? new Date(ev.arrival.at).toISOString() : null,
      verification_channel: ev.arrival?.via,
      payout_status: 'authorized',
    };
  } else if (ev.outcome === 'late') {
    eventType = 'arrival.verified';
    payloadDetails = {
      action: 'flag_late_arrival',
      contractor: v.contractor,
      job: v.title,
      arrival_time: ev.arrival?.at ? new Date(ev.arrival.at).toISOString() : null,
      sla_breach_detected: true,
      payout_status: 'pending_review',
    };
  } else if (ev.outcome === 'no_arrival_detected') {
    eventType = 'noshow.penalized';
    payloadDetails = {
      action: 'trigger_noshow_refund',
      contractor: v.contractor,
      job: v.title,
      cancellation_fee_applied: true,
      contractor_dispute_eligible: true,
    };
  } else {
    eventType = 'access.granted';
    payloadDetails = {
      action: 'doorstep_monitoring_active',
      contractor: v.contractor,
      job: v.title,
      window: `${new Date(v.windowStart).toISOString()} to ${new Date(v.windowEnd).toISOString()}`,
    };
  }

  const endpointMap: Record<PlatformTarget, string> = {
    Jobber: 'https://api.getjobber.com/api/v2/webhooks/arrival_verification',
    Stripe: 'https://api.stripe.com/v1/payment_intents/capture_arrival',
    'Housecall Pro': 'https://api.housecallpro.com/v1/jobs/check_in',
    Custom: 'https://webhook.site/doorstep-receipts-demo',
  };

  return {
    id: `biz_${randomUUID().slice(0, 8)}`,
    visitId: v.id,
    eventType,
    platform,
    targetUrl: endpointMap[platform] || endpointMap.Jobber,
    status: 'delivered',
    timestamp: now,
    payload: {
      event_id: `evt_${Date.now()}`,
      object: 'event',
      type: eventType,
      created: Math.floor(now / 1000),
      data: {
        receipt_id: v.id.slice(0, 8).toUpperCase(),
        ...payloadDetails,
      },
    },
  };
}
