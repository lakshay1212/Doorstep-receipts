import type { DeviceStatusChange, DisputeAudit, Outcome, Phase, SignalKind, SmartLockAccess, Visit } from './types.js';
import { fmtDayTime, fmtDuration, fmtTime } from './domain/format.js';
import { evaluateVisit, watchPeriod } from './domain/visit.js';
import { evaluateSmartLock } from './domain/access.js';
import { generateVerificationSeal, type VerificationSeal } from './domain/verification.js';

export const OUTCOME_LABEL: Record<Outcome, string> = {
  pending: 'Waiting',
  on_time: 'In the window',
  early: 'Arrived early',
  late: 'Arrived late',
  no_arrival_detected: 'No arrival detected',
  inconclusive_offline: "Can't tell",
};

export const KIND_LABEL = {
  button_press: 'Doorbell pressed',
  motion_human: 'Person detected at the door',
} as const;

export const CAVEATS = [
  'This receipt reflects doorbell presses and people detected by a Ring camera. It cannot say who was at the door.',
  'No camera footage is stored or shared. Signals outside the booked watch period were never kept.',
];

export function receiptNo(v: Visit): string {
  return v.id.slice(0, 8).toUpperCase();
}

export interface VisitView {
  id: string;
  receiptNo: string;
  title: string;
  contractor: string;
  deviceId: string;
  timeZone: string;
  windowStart: number;
  windowEnd: number;
  windowLabel: string;
  watchLabel: string;
  phase: Phase;
  outcome: Outcome;
  outcomeLabel: string;
  headline: string;
  detail: string;
  arrivalLabel: string | null;
  onSiteLabel: string | null;
  offlineMinutes: number;
  signals: Array<{ id: string; at: number; kind: SignalKind; timeLabel: string; label: string; excluded: boolean }>;
  departureLabel: string | null;
  canConfirmDeparture: boolean;
  share: { url: string; expiresLabel: string; active: boolean } | null;
  summary: { text: string; source: string } | null;
  smartLock: SmartLockAccess;
  dispute: DisputeAudit | null;
  verification: VerificationSeal;
}

export function visitView(
  v: Visit,
  log: DeviceStatusChange[],
  now: number,
  baseUrl: string,
  signingKey: string = '',
): VisitView {
  const ev = evaluateVisit(v, log, now);
  const tz = v.timeZone;
  const watch = watchPeriod(v);
  const shareActive = !!v.share && !v.share.revokedAt && v.share.expiresAt > now;
  const smartLock = evaluateSmartLock(v, ev, now);
  const verification = generateVerificationSeal(v, ev, signingKey);

  return {
    id: v.id,
    receiptNo: receiptNo(v),
    title: v.title,
    contractor: v.contractor,
    deviceId: v.deviceId,
    timeZone: tz,
    windowStart: v.windowStart,
    windowEnd: v.windowEnd,
    windowLabel: `${fmtDayTime(v.windowStart, tz)} to ${fmtTime(v.windowEnd, tz)}`,
    watchLabel: `${fmtTime(watch.from, tz)} to ${fmtTime(watch.to, tz)}`,
    phase: ev.phase,
    outcome: ev.outcome,
    outcomeLabel: OUTCOME_LABEL[ev.outcome],
    headline: ev.headline,
    detail: ev.detail,
    arrivalLabel: ev.arrival ? fmtTime(ev.arrival.at, tz) : null,
    onSiteLabel: ev.onSite
      ? `${fmtDuration(ev.onSite.minutes)} ${ev.onSite.basis === 'confirmed' ? '(confirmed)' : '(estimate)'}`
      : null,
    offlineMinutes: ev.offlineMinutes,
    signals: v.signals.map((s) => ({
      id: s.id,
      at: s.at,
      kind: s.kind,
      timeLabel: fmtTime(s.at, tz),
      label: KIND_LABEL[s.kind],
      excluded: s.excluded,
    })),
    departureLabel: v.departureConfirmedAt ? fmtTime(v.departureConfirmedAt, tz) : null,
    canConfirmDeparture: !!ev.arrival && v.departureConfirmedAt === null,
    share: v.share
      ? {
          url: `${baseUrl}/r/${v.share.token}`,
          expiresLabel: fmtDayTime(v.share.expiresAt, tz),
          active: shareActive,
        }
      : null,
    summary: v.summary ? { text: v.summary.text, source: v.summary.source } : null,
    smartLock,
    dispute: v.dispute ?? null,
    verification,
  };
}

/** What the contractor sees: no device ids, no event ids, no account ids. */
export interface ReceiptView {
  receiptNo: string;
  title: string;
  contractor: string;
  windowLabel: string;
  watchLabel: string;
  outcome: Outcome;
  outcomeLabel: string;
  headline: string;
  detail: string;
  arrivalLabel: string | null;
  onSiteLabel: string | null;
  offlineMinutes: number;
  signals: Array<{ timeLabel: string; label: string }>;
  signalsMarkedNotThem: number;
  summary: string | null;
  expiresLabel: string;
  caveats: string[];
  smartLock: {
    state: 'active' | 'locked' | 'revoked';
    pin: string;
    message: string;
  };
  verificationSeal: {
    algorithm: 'HMAC-SHA256';
    digest: string;
    fingerprint: string;
    verified: boolean;
    certifiedAt: string;
  };
  shareUrl: string;
}

export function receiptView(
  v: Visit,
  log: DeviceStatusChange[],
  now: number,
  baseUrl: string = '',
  signingKey: string = '',
): ReceiptView {
  const full = visitView(v, log, now, baseUrl, signingKey);

  let lockMessage = 'Smart Lock is locked. One-time PINs are only granted for verified in-window arrivals.';
  if (full.smartLock.state === 'active') {
    lockMessage = `Access granted! Enter PIN on the door keypad. Valid until visit completion.`;
  } else if (full.smartLock.state === 'revoked') {
    lockMessage = 'Smart lock access was revoked by the homeowner.';
  } else if (full.outcome === 'late') {
    lockMessage = 'Locked: Arrival was outside the agreed window SLA.';
  }

  return {
    receiptNo: full.receiptNo,
    title: full.title,
    contractor: full.contractor,
    windowLabel: full.windowLabel,
    watchLabel: full.watchLabel,
    outcome: full.outcome,
    outcomeLabel: full.outcomeLabel,
    headline: full.headline,
    detail: full.detail,
    arrivalLabel: full.arrivalLabel,
    onSiteLabel: full.onSiteLabel,
    offlineMinutes: full.offlineMinutes,
    signals: full.signals.filter((s) => !s.excluded).map((s) => ({ timeLabel: s.timeLabel, label: s.label })),
    signalsMarkedNotThem: full.signals.filter((s) => s.excluded).length,
    summary: full.summary ? full.summary.text : null,
    expiresLabel: v.share ? fmtDayTime(v.share.expiresAt, v.timeZone) : '',
    caveats: CAVEATS,
    smartLock: {
      state: full.smartLock.state,
      pin: full.smartLock.pin,
      message: lockMessage,
    },
    verificationSeal: {
      algorithm: full.verification.algorithm,
      digest: full.verification.digest,
      fingerprint: full.verification.fingerprint,
      verified: full.verification.verified,
      certifiedAt: full.verification.certifiedAt,
    },
    shareUrl: full.share ? full.share.url : '',
  };
}
