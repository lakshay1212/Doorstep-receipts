import type {
  DbShape,
  DeviceStatusChange,
  DoorSignal,
  Outcome,
  Phase,
  SignalKind,
  Visit,
} from '../types.js';
import { MINUTE, fmtDuration, fmtTime } from './format.js';

/** Signals dated further ahead than this are rejected (clock skew allowance). */
export const FUTURE_SKEW_MS = 5 * MINUTE;
/** Offline time inside the watch period that makes "no arrival" inconclusive. */
export const OFFLINE_THRESHOLD_MIN = 10;
/** First-to-last doorstep activity shorter than this is not reported as time on site. */
export const MIN_ESTIMATE_MIN = 2;

export function watchPeriod(v: Visit): { from: number; to: number } {
  return { from: v.windowStart - v.earlyGraceMin * MINUTE, to: v.windowEnd + v.lateGraceMin * MINUTE };
}

export interface IncomingSignal {
  accountId: string;
  deviceId: string;
  id: string;
  kind: SignalKind;
  at: number;
}

/**
 * Privacy gate. A signal is kept only if it falls inside the watch period of a visit
 * on the same Ring account and device. Everything else is discarded without being stored.
 * Returns how many visits the signal was attached to (0 means discarded).
 */
export function routeSignal(db: DbShape, sig: IncomingSignal, now: number): number {
  if (sig.at > now + FUTURE_SKEW_MS) {
    db.counters.discarded += 1;
    return 0;
  }
  let attached = 0;
  for (const v of db.visits) {
    if (v.accountId !== sig.accountId || v.deviceId !== sig.deviceId) continue;
    const { from, to } = watchPeriod(v);
    if (sig.at < from || sig.at > to) continue;
    attached += 1;
    if (v.signals.some((s) => s.id === sig.id)) continue; // duplicate delivery
    const stored: DoorSignal = {
      id: sig.id,
      deviceId: sig.deviceId,
      kind: sig.kind,
      at: sig.at,
      excluded: false,
    };
    v.signals.push(stored);
    v.signals.sort((a, b) => a.at - b.at);
  }
  if (attached > 0) db.counters.kept += 1;
  else db.counters.discarded += 1;
  return attached;
}

export interface OfflineSpan {
  from: number;
  to: number;
}

/** Offline spans for one device, clipped to [from, to]. Unknown state counts as online. */
export function offlineSpans(
  log: DeviceStatusChange[],
  deviceId: string,
  from: number,
  to: number,
): OfflineSpan[] {
  if (to <= from) return [];
  const changes = log.filter((c) => c.deviceId === deviceId).sort((a, b) => a.at - b.at);
  let state: 'online' | 'offline' = 'online';
  for (const c of changes) if (c.at <= from) state = c.status;
  const spans: OfflineSpan[] = [];
  let offlineSince: number | null = state === 'offline' ? from : null;
  for (const c of changes) {
    if (c.at <= from || c.at >= to) continue;
    if (c.status === 'offline' && offlineSince === null) offlineSince = c.at;
    if (c.status === 'online' && offlineSince !== null) {
      spans.push({ from: offlineSince, to: c.at });
      offlineSince = null;
    }
  }
  if (offlineSince !== null) spans.push({ from: offlineSince, to });
  return spans;
}

export interface Evaluation {
  phase: Phase;
  outcome: Outcome;
  arrival: { at: number; via: SignalKind } | null;
  lastSeenAt: number | null;
  onSite: { minutes: number; basis: 'confirmed' | 'estimated' } | null;
  offlineMinutes: number;
  headline: string;
  detail: string;
}

export function evaluateVisit(v: Visit, log: DeviceStatusChange[], now: number): Evaluation {
  const tz = v.timeZone;
  const watch = watchPeriod(v);
  const qualifying = v.signals.filter((s) => !s.excluded).sort((a, b) => a.at - b.at);
  const first = qualifying[0] ?? null;
  const last = qualifying[qualifying.length - 1] ?? null;

  const spans = offlineSpans(log, v.deviceId, watch.from, Math.min(watch.to, now));
  const offlineMinutes = Math.round(spans.reduce((n, s) => n + (s.to - s.from), 0) / MINUTE);

  const closed = v.departureConfirmedAt !== null || now > watch.to;
  const phase: Phase = closed
    ? 'closed'
    : first
      ? 'arrived'
      : now >= watch.from
        ? 'watching'
        : 'scheduled';

  let outcome: Outcome;
  if (first) {
    outcome = first.at < v.windowStart ? 'early' : first.at <= v.windowEnd ? 'on_time' : 'late';
  } else if (now > watch.to) {
    outcome = offlineMinutes >= OFFLINE_THRESHOLD_MIN ? 'inconclusive_offline' : 'no_arrival_detected';
  } else {
    outcome = 'pending';
  }

  let onSite: Evaluation['onSite'] = null;
  if (first && v.departureConfirmedAt !== null && v.departureConfirmedAt >= first.at) {
    onSite = {
      minutes: Math.round((v.departureConfirmedAt - first.at) / MINUTE),
      basis: 'confirmed',
    };
  } else if (first && last && (last.at - first.at) / MINUTE >= MIN_ESTIMATE_MIN) {
    onSite = { minutes: Math.round((last.at - first.at) / MINUTE), basis: 'estimated' };
  }

  const via = first ? (first.kind === 'button_press' ? 'doorbell press' : 'person detection') : '';
  const wStart = fmtTime(v.windowStart, tz);
  const wEnd = fmtTime(v.windowEnd, tz);
  let headline = '';
  let detail = '';
  switch (outcome) {
    case 'on_time':
      headline = `Someone was at the door at ${fmtTime(first!.at, tz)}, inside the ${wStart} to ${wEnd} window.`;
      detail = `First seen through a ${via}.`;
      break;
    case 'early':
      headline = `Someone was at the door at ${fmtTime(first!.at, tz)}, ${fmtDuration((v.windowStart - first!.at) / MINUTE)} before the window opened.`;
      detail = `First seen through a ${via}.`;
      break;
    case 'late':
      headline = `Someone was at the door at ${fmtTime(first!.at, tz)}, ${fmtDuration((first!.at - v.windowEnd) / MINUTE)} after the window closed.`;
      detail = `First seen through a ${via}.`;
      break;
    case 'no_arrival_detected':
      headline = `No one was detected at the door between ${fmtTime(watch.from, tz)} and ${fmtTime(watch.to, tz)}.`;
      detail = 'That is not proof nobody came: they may have used a different entrance.';
      break;
    case 'inconclusive_offline':
      headline = `The camera was offline for ${fmtDuration(offlineMinutes)} while the door was being watched, so this can't be settled.`;
      detail = 'No one was detected, but the device could not have seen them.';
      break;
    default:
      headline =
        phase === 'scheduled'
          ? `Watching starts at ${fmtTime(watch.from, tz)}.`
          : `Watching the door until ${fmtTime(watch.to, tz)}.`;
      detail = 'The receipt fills in as soon as someone reaches the door.';
  }

  return {
    phase,
    outcome,
    arrival: first ? { at: first.at, via: first.kind } : null,
    lastSeenAt: last ? last.at : null,
    onSite,
    offlineMinutes,
    headline,
    detail,
  };
}
