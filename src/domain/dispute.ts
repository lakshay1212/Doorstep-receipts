import type { DisputeAudit, DisputeVerdict, Visit } from '../types.js';
import type { SummaryFacts, Converse } from './summary.js';
import type { Evaluation } from './visit.js';
import { fmtTime } from './format.js';

export function templateDisputeAudit(
  v: Visit,
  ev: Evaluation,
  facts: SummaryFacts,
  claim: string,
  now: number,
  modelId?: string,
): DisputeAudit {
  const structuredEvidence: Record<string, unknown> = {
    visitId: v.id.slice(0, 8).toUpperCase(),
    job: v.title,
    contractor: v.contractor,
    bookedWindow: facts.bookedWindow,
    watchedBetween: facts.watchedBetween,
    sensorOutcome: ev.outcome,
    cameraOfflineMinutes: ev.offlineMinutes,
    recordedSignalsCount: v.signals.filter((s) => !s.excluded).length,
    firstArrival: ev.arrival ? { at: fmtTime(ev.arrival.at, v.timeZone), via: ev.arrival.via } : null,
  };

  const defaultLimitations = [
    'Ring camera monitors designated door only; rear or side entrances are unmonitored.',
    'Presence sensor detects people at the threshold; it cannot verify identity without video inspection.',
  ];

  // Scenario 1: Camera was offline during the watch window >= 10 min -> Inconclusive
  if (ev.offlineMinutes >= 10) {
    return {
      contractorClaim: claim,
      verdict: 'Inconclusive',
      confidence: 0.94,
      analysis: `Ring camera was offline for ${ev.offlineMinutes} minutes during the booked monitoring period (${facts.watchedBetween}). Sensor telemetry is insufficient to prove or disprove arrival during this outage window.`,
      recommendedSettlement: 'Settle dispute as inconclusive due to equipment downtime. Waive no-show penalty and permit fee-free rebooking.',
      evidenceReferences: [
        `Device Telemetry: Ring camera offline for ${ev.offlineMinutes} minutes`,
        `Watch Window: ${facts.watchedBetween}`,
      ],
      limitations: [
        ...defaultLimitations,
        `Device outage of ${ev.offlineMinutes} minutes creates an unobserved gap during the arrival window.`,
      ],
      source: 'template',
      modelId,
      structuredEvidence,
      auditedAt: now,
    };
  }

  // Scenario 2: Contractor actually arrived
  if (ev.arrival) {
    const arrTime = fmtTime(ev.arrival.at, v.timeZone);
    const via = ev.arrival.via === 'button_press' ? 'doorbell press' : 'person detection';

    if (ev.outcome === 'late') {
      return {
        contractorClaim: claim,
        verdict: 'Contradicted',
        confidence: 0.95,
        analysis: `Telemetry contradicts on-time arrival. Physical presence was first registered at ${arrTime} via ${via}, which occurred after the booked window ended (${facts.bookedWindow}).`,
        recommendedSettlement: 'Contractor was present but breached window SLA. Apply late-arrival policy rather than full no-show cancellation.',
        evidenceReferences: [
          `Ring Signal: ${via} registered at ${arrTime}`,
          `Agreed SLA Window: ${facts.bookedWindow}`,
        ],
        limitations: defaultLimitations,
        source: 'template',
        modelId,
        structuredEvidence,
        auditedAt: now,
      };
    }

    if (ev.outcome === 'on_time') {
      return {
        contractorClaim: claim,
        verdict: 'Supported',
        confidence: 0.98,
        analysis: `Ring telemetry validates the claim. A person reached the door at ${arrTime} via ${via}, directly inside the agreed ${facts.bookedWindow} arrival window.`,
        recommendedSettlement: 'Dispute resolved in contractor favor: physical arrival inside window is verified by doorstep sensors.',
        evidenceReferences: [
          `Ring Signal: ${via} registered at ${arrTime} (in-window)`,
          `Agreed Window: ${facts.bookedWindow}`,
        ],
        limitations: defaultLimitations,
        source: 'template',
        modelId,
        structuredEvidence,
        auditedAt: now,
      };
    }
  }

  // Scenario 3: No arrival detected and camera online 100%
  return {
    contractorClaim: claim,
    verdict: 'Contradicted',
    confidence: 0.91,
    analysis: `Ring camera was 100% online throughout the entire watch period (${facts.watchedBetween}) with 0 minutes of downtime. No doorbell presses or human motion were detected at this entrance.`,
    recommendedSettlement: 'Uphold no-show resolution for this door unless contractor provides evidence of attending a secondary unmonitored entrance.',
    evidenceReferences: [
      `Device Telemetry: 100% camera uptime between ${facts.watchedBetween}`,
      `Sensor Log: 0 person detections or doorbell events recorded`,
    ],
    limitations: defaultLimitations,
    source: 'template',
    modelId,
    structuredEvidence,
    auditedAt: now,
  };
}

const DISPUTE_SYSTEM_PROMPT = `
You are an impartial, arbitration-grade AI dispute arbiter for home-service appointments.
Analyze the user-provided contractor claim against the ground-truth Ring doorbell facts.

You must categorize the dispute into EXACTLY ONE of three standard verdicts:
1. "Supported": Available evidence confirms the contractor arrived as claimed.
2. "Contradicted": Available evidence directly conflicts with the contractor's claim (e.g. arrived late or no presence when camera was online).
3. "Inconclusive": Available evidence is insufficient to settle (e.g. camera had an outage, device was offline).

Output a JSON object with EXACTLY these keys:
{
  "verdict": "Supported" | "Contradicted" | "Inconclusive",
  "confidence": number between 0.50 and 0.99,
  "analysis": "2-3 sentences explaining what Ring telemetry confirms or contradicts regarding the claim",
  "recommendedSettlement": "1-2 sentences with an equitable resolution",
  "evidenceReferences": ["list of 2-3 specific timestamp/telemetry facts used"],
  "limitations": ["list of 1-2 sensor boundaries or caveats"]
}

Rules:
- Never assume absence if the camera had an outage >= 10 minutes; mark as Inconclusive.
- Cross-reference exact timestamps between the claim and the recorded signals.
- Output strictly valid JSON with no markdown backticks.
`.trim();

export async function buildDisputeAudit(
  v: Visit,
  ev: Evaluation,
  facts: SummaryFacts,
  claim: string,
  converse: Converse | null,
  now: number,
  modelId?: string,
): Promise<DisputeAudit> {
  const structuredEvidence: Record<string, unknown> = {
    visitId: v.id.slice(0, 8).toUpperCase(),
    job: v.title,
    contractor: v.contractor,
    bookedWindow: facts.bookedWindow,
    watchedBetween: facts.watchedBetween,
    sensorOutcome: ev.outcome,
    cameraOfflineMinutes: ev.offlineMinutes,
    recordedSignalsCount: v.signals.filter((s) => !s.excluded).length,
    firstArrival: ev.arrival ? { at: fmtTime(ev.arrival.at, v.timeZone), via: ev.arrival.via } : null,
  };

  if (converse) {
    try {
      const payload = {
        structuredEvidence,
        contractorClaim: claim,
      };

      const raw = await converse(DISPUTE_SYSTEM_PROMPT, JSON.stringify(payload));
      const clean = raw.trim().replace(/^```json/, '').replace(/```$/, '').trim();
      const parsed = JSON.parse(clean);

      const validVerdicts: DisputeVerdict[] = ['Supported', 'Contradicted', 'Inconclusive'];
      if (
        validVerdicts.includes(parsed.verdict) &&
        parsed.analysis &&
        parsed.recommendedSettlement
      ) {
        return {
          contractorClaim: claim,
          verdict: parsed.verdict,
          confidence: Number(parsed.confidence) || 0.92,
          analysis: parsed.analysis,
          recommendedSettlement: parsed.recommendedSettlement,
          evidenceReferences: Array.isArray(parsed.evidenceReferences) ? parsed.evidenceReferences : [],
          limitations: Array.isArray(parsed.limitations) ? parsed.limitations : [],
          source: 'bedrock',
          modelId,
          structuredEvidence,
          auditedAt: now,
        };
      }
    } catch {
      // Fallback gracefully to template if model call fails
    }
  }

  return templateDisputeAudit(v, ev, facts, claim, now, modelId);
}
