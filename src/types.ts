/** Only two kinds of Ring signal are ever kept: a doorbell press or a person detected at the door. */
export type SignalKind = 'button_press' | 'motion_human';

export interface DoorSignal {
  /** Ring event id, format <device_id>_<type or subType>_<timestamp> */
  id: string;
  deviceId: string;
  kind: SignalKind;
  /** Epoch ms from data.attributes.timestamp */
  at: number;
  /** Homeowner marked this signal as "not the contractor" */
  excluded: boolean;
}

export interface DeviceStatusChange {
  deviceId: string;
  status: 'online' | 'offline';
  at: number;
}

export interface ShareLink {
  token: string;
  expiresAt: number;
  revokedAt?: number;
}

export interface SmartLockAccess {
  pin: string;
  state: 'active' | 'revoked' | 'locked';
  issuedAt: number;
  expiresAt: number;
}

export type DisputeVerdict = 'Supported' | 'Contradicted' | 'Inconclusive';

export interface DisputeAudit {
  contractorClaim: string;
  verdict: DisputeVerdict;
  confidence: number;
  analysis: string;
  recommendedSettlement: string;
  evidenceReferences: string[];
  limitations: string[];
  source: 'bedrock' | 'template';
  modelId?: string;
  structuredEvidence?: Record<string, unknown>;
  auditedAt: number;
}

export interface BusinessWebhookEvent {
  id: string;
  visitId: string;
  eventType: 'arrival.verified' | 'visit.completed' | 'noshow.penalized' | 'access.granted' | 'dispute.filed';
  platform: 'Jobber' | 'Stripe' | 'Housecall Pro' | 'Custom';
  targetUrl: string;
  status: 'delivered' | 'simulated';
  timestamp: number;
  payload: Record<string, unknown>;
}

export interface VisitSummary {
  text: string;
  source: 'bedrock' | 'template';
  generatedAt: number;
}

export interface Visit {
  id: string;
  accountId: string;
  deviceId: string;
  title: string;
  contractor: string;
  timeZone: string;
  /** Arrival window the homeowner agreed with the contractor (epoch ms) */
  windowStart: number;
  windowEnd: number;
  /** Minutes before windowStart that the door is watched */
  earlyGraceMin: number;
  /** Minutes after windowEnd that the door is watched (late arrivals still count) */
  lateGraceMin: number;
  createdAt: number;
  signals: DoorSignal[];
  departureConfirmedAt: number | null;
  share: ShareLink | null;
  summary: VisitSummary | null;
  smartLock?: SmartLockAccess | null;
  dispute?: DisputeAudit | null;
}

export interface DbShape {
  visits: Visit[];
  deviceLog: DeviceStatusChange[];
  seenRequestIds: string[];
  counters: { kept: number; discarded: number };
  businessLog?: BusinessWebhookEvent[];
}

export type NormalizedRingEvent =
  | {
      type: 'signal';
      requestId: string;
      accountId: string;
      deviceId: string;
      eventId: string;
      kind: SignalKind | 'motion_other';
      at: number;
    }
  | {
      type: 'device_status';
      requestId: string;
      accountId: string;
      deviceId: string;
      status: 'online' | 'offline';
      at: number;
    }
  | { type: 'ignored'; requestId: string; accountId: string; reason: string };

export type Phase = 'scheduled' | 'watching' | 'arrived' | 'closed';

export type Outcome =
  | 'pending'
  | 'on_time'
  | 'early'
  | 'late'
  | 'no_arrival_detected'
  | 'inconclusive_offline';
