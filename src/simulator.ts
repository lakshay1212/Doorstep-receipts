import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { MINUTE } from './domain/format.js';
import { watchPeriod } from './domain/visit.js';
import { signBody } from './ring/verify.js';
import type { Visit } from './types.js';

export type RingEventType = 'button_press' | 'motion_detected' | 'device_online' | 'device_offline';

export interface BuildOpts {
  accountId: string;
  deviceId: string;
  type: RingEventType;
  subType?: string;
  /** Event time (epoch ms) */
  at: number;
  /** Delivery time (epoch ms), defaults to Date.now() */
  sentAt?: number;
  requestId?: string;
}

/** Builds a Ring Partner API webhook v1.1 payload exactly as documented. */
export function buildRingWebhook(o: BuildOpts) {
  const idPart = o.type === 'motion_detected' ? (o.subType ?? 'unknown') : o.type;
  return {
    meta: {
      version: '1.1',
      time: new Date(o.sentAt ?? Date.now()).toISOString(),
      request_id: o.requestId ?? randomUUID(),
      account_id: o.accountId,
    },
    data: {
      id: `${o.deviceId}_${idPart}_${o.at}`,
      type: o.type,
      ...(o.subType ? { subType: o.subType } : {}),
      attributes: { source: o.deviceId, source_type: 'devices', timestamp: o.at },
      relationships: { devices: { links: { self: `/v1/devices/${o.deviceId}` } } },
    },
  };
}

/** POST a signed webhook to a URL, the same way Ring would. */
export async function deliverWebhook(url: string, signingKey: string, payload: object): Promise<number> {
  const raw = JSON.stringify(payload);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Signature': signBody(signingKey, raw) },
    body: raw,
  });
  return res.status;
}

export const SCENARIOS = [
  'arrive_early',
  'arrive_on_time',
  'arrive_late',
  'leave',
  'doorbell_now',
  'person_now',
  'camera_offline',
  'camera_online',
  'passerby_outside_windows',
] as const;
export type Scenario = (typeof SCENARIOS)[number];

export interface PlannedEvent {
  type: RingEventType;
  subType?: string;
  at: number;
}

export class ScenarioError extends Error {}

/**
 * Pure planner: which Ring events does a scenario send for this visit?
 * Events are never dated in the future, because the server rejects those.
 */
export function planScenario(v: Visit, scenario: Scenario, now: number): PlannedEvent[] {
  const watch = watchPeriod(v);
  const latest = now - 30_000;
  const checked = (at: number, hint: string): number => {
    if (at > latest) throw new ScenarioError(hint);
    return at;
  };
  const arrival = (at: number): PlannedEvent[] => [
    { type: 'button_press', at },
    { type: 'motion_detected', subType: 'human', at: at + 20_000 },
  ];

  switch (scenario) {
    case 'arrive_early':
      return arrival(
        checked(v.windowStart - Math.min(10, v.earlyGraceMin) * MINUTE, 'That moment has not happened yet.'),
      );
    case 'arrive_on_time': {
      const dur = (v.windowEnd - v.windowStart) / MINUTE;
      return arrival(
        checked(
          v.windowStart + Math.min(10, Math.floor(dur / 2)) * MINUTE,
          'The window has not opened long enough for that. Use "Doorbell now" instead.',
        ),
      );
    }
    case 'arrive_late':
      return arrival(
        checked(
          v.windowEnd + Math.min(25, Math.max(1, v.lateGraceMin - 5)) * MINUTE,
          'This window has not closed yet. Use the "Window already ended" demo visit for late arrivals.',
        ),
      );
    case 'leave': {
      const firstKept = v.signals.filter((s) => !s.excluded).sort((a, b) => a.at - b.at)[0];
      const base = firstKept ? firstKept.at : v.windowStart + 10 * MINUTE;
      return [
        {
          type: 'motion_detected',
          subType: 'human',
          at: checked(base + 35 * MINUTE, 'They would still be on site. Use "Confirm they have left" when they go.'),
        },
      ];
    }
    case 'doorbell_now':
      return [{ type: 'button_press', at: latest }];
    case 'person_now':
      return [{ type: 'motion_detected', subType: 'human', at: latest }];
    case 'camera_offline':
      return [{ type: 'device_offline', at: Math.min(watch.from + 5 * MINUTE, now - 60_000) }];
    case 'camera_online':
      return [{ type: 'device_online', at: Math.min(watch.to - 5 * MINUTE, latest) }];
    case 'passerby_outside_windows':
      return [{ type: 'motion_detected', subType: 'human', at: now - 40 * 24 * 60 * MINUTE }];
  }
}

/** For each scenario: null if it can run for this visit right now, otherwise why not. */
export function scenarioAvailability(v: Visit, now: number): Record<Scenario, string | null> {
  const out = {} as Record<Scenario, string | null>;
  for (const s of SCENARIOS) {
    try {
      planScenario(v, s, now);
      out[s] = null;
    } catch (e) {
      if (e instanceof ScenarioError) out[s] = e.message;
      else throw e;
    }
  }
  return out;
}

// ---- CLI: npm run simulate -- --type button_press --at now ----
function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}

async function cli() {
  const url = arg('url', 'http://localhost:3000/webhooks/ring')!;
  const key = arg('key', process.env.RING_WEBHOOK_SIGNING_KEY || 'dev-signing-key')!;
  const type = arg('type', 'button_press') as RingEventType;
  const atArg = arg('at', 'now')!;
  const at = atArg === 'now' ? Date.now() - 1000 : Number(atArg);
  const payload = buildRingWebhook({
    accountId: arg('account', process.env.DEMO_ACCOUNT_ID || 'ava1.ring.account.DEMO')!,
    deviceId: arg('device', 'sim-doorbell-front')!,
    type,
    subType: arg('sub-type', type === 'motion_detected' ? 'human' : undefined),
    at,
  });
  const status = await deliverWebhook(url, key, payload);
  console.log(`${type} at ${new Date(at).toISOString()} -> HTTP ${status}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  cli().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
