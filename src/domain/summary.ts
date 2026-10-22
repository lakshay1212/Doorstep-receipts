import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import type { Outcome, Visit, VisitSummary } from '../types.js';
import { MINUTE, fmtDay, fmtDuration, fmtTime } from './format.js';
import type { Evaluation } from './visit.js';
import { watchPeriod } from './visit.js';

/** Everything the summary may mention. Nothing else is ever sent to the model. */
export interface SummaryFacts {
  job: string;
  contractor: string;
  day: string;
  bookedWindow: string;
  watchedBetween: string;
  outcome: Outcome;
  firstSeenAt: string | null;
  firstSeenThrough: string | null;
  relativeToWindow: string | null;
  timeOnSite: string | null;
  cameraOfflineMinutes: number;
  signalsMarkedNotThem: number;
}

export function factsFor(v: Visit, ev: Evaluation): SummaryFacts {
  const tz = v.timeZone;
  const watch = watchPeriod(v);
  let relative: string | null = null;
  if (ev.arrival) {
    if (ev.outcome === 'early') relative = `${fmtDuration((v.windowStart - ev.arrival.at) / MINUTE)} before the window opened`;
    else if (ev.outcome === 'late') relative = `${fmtDuration((ev.arrival.at - v.windowEnd) / MINUTE)} after the window closed`;
    else relative = 'inside the booked window';
  }
  return {
    job: v.title,
    contractor: v.contractor,
    day: fmtDay(v.windowStart, tz),
    bookedWindow: `${fmtTime(v.windowStart, tz)} to ${fmtTime(v.windowEnd, tz)}`,
    watchedBetween: `${fmtTime(watch.from, tz)} to ${fmtTime(watch.to, tz)}`,
    outcome: ev.outcome,
    firstSeenAt: ev.arrival ? fmtTime(ev.arrival.at, tz) : null,
    firstSeenThrough: ev.arrival ? (ev.arrival.via === 'button_press' ? 'doorbell press' : 'person detection') : null,
    relativeToWindow: relative,
    timeOnSite: ev.onSite
      ? `${fmtDuration(ev.onSite.minutes)} (${ev.onSite.basis === 'confirmed' ? 'confirmed by the homeowner' : 'estimated from first to last doorstep activity'})`
      : null,
    cameraOfflineMinutes: ev.offlineMinutes,
    signalsMarkedNotThem: v.signals.filter((s) => s.excluded).length,
  };
}

export function templateSummary(f: SummaryFacts): string {
  const head = `${f.contractor} was booked for "${f.job}" on ${f.day}, ${f.bookedWindow}.`;
  switch (f.outcome) {
    case 'on_time':
    case 'early':
    case 'late': {
      let s = `${head} A person was first detected at the door at ${f.firstSeenAt} through a ${f.firstSeenThrough}, ${f.relativeToWindow}.`;
      if (f.timeOnSite) s += ` Time on site: ${f.timeOnSite}.`;
      return s;
    }
    case 'no_arrival_detected':
      return `${head} No one was detected at the door between ${f.watchedBetween}. That does not prove nobody came, since they may have used another entrance.`;
    case 'inconclusive_offline':
      return `${head} The camera was offline for ${f.cameraOfflineMinutes} minutes while the door was watched (${f.watchedBetween}), so the lack of detections cannot settle whether anyone came.`;
    default:
      return `${head} The door is being watched ${f.watchedBetween}; the receipt will update when someone reaches the door.`;
  }
}

const SYSTEM_PROMPT = [
  'You write a neutral 2 to 3 sentence summary of a home-service visit for a homeowner and a contractor.',
  'Use only the facts in the JSON the user sends. Do not guess who was at the door, do not assign blame,',
  'and do not invent any time, duration or detail that is not in the JSON.',
  'If the outcome is no_arrival_detected or inconclusive_offline, say plainly what that does and does not prove.',
  'Plain text only, no markdown, under 70 words.',
].join(' ');

function timesIn(text: string): Set<string> {
  return new Set((text.match(/\b\d{1,2}:\d{2}\b/g) ?? []).map((t) => t.replace(/^0/, '')));
}

/** Reject any model output that mentions a clock time absent from the facts. */
export function isGrounded(output: string, facts: SummaryFacts): boolean {
  const allowed = timesIn(JSON.stringify(facts));
  for (const t of timesIn(output)) if (!allowed.has(t)) return false;
  return true;
}

export type Converse = (system: string, user: string) => Promise<string>;

export function bedrockConverse(modelId: string, region: string): Converse {
  const client = new BedrockRuntimeClient({ region });
  return async (system, user) => {
    const res = await client.send(
      new ConverseCommand({
        modelId,
        system: [{ text: system }],
        messages: [{ role: 'user', content: [{ text: user }] }],
        inferenceConfig: { maxTokens: 220, temperature: 0.2 },
      }),
    );
    const block = res.output?.message?.content?.find((c) => 'text' in c && typeof c.text === 'string');
    return (block && 'text' in block ? block.text : '') ?? '';
  };
}

export async function buildSummary(
  facts: SummaryFacts,
  converse: Converse | null,
  now: number,
): Promise<VisitSummary> {
  if (converse) {
    try {
      const text = (await converse(SYSTEM_PROMPT, JSON.stringify(facts))).trim();
      if (text && isGrounded(text, facts)) return { text, source: 'bedrock', generatedAt: now };
    } catch {
      /* fall through to the template: a receipt must never fail because a model call did */
    }
  }
  return { text: templateSummary(facts), source: 'template', generatedAt: now };
}
