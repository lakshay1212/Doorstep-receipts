import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import type { Config } from './config.js';
import { MINUTE, isValidTimeZone } from './domain/format.js';
import QRCode from 'qrcode';
import {
  bedrockConverse,
  buildSummary,
  factsFor,
  type Converse,
} from './domain/summary.js';
import { buildDisputeAudit } from './domain/dispute.js';
import { createBusinessEvent, type PlatformTarget } from './domain/business.js';
import { generateVerificationSeal, verifyEvidenceIntegrity } from './domain/verification.js';
import { FUTURE_SKEW_MS, evaluateVisit } from './domain/visit.js';
import { ingestWebhook } from './ingest.js';
import { renderGonePage, renderReceiptPage } from './render/receipt.js';
import { DEMO_DEVICES, listDevices } from './ring/client.js';
import {
  SCENARIOS,
  ScenarioError,
  buildRingWebhook,
  deliverWebhook,
  planScenario,
  scenarioAvailability,
  type Scenario,
} from './simulator.js';
import type { Store } from './store.js';
import type { Visit } from './types.js';
import { receiptView, visitView, type VisitView } from './views.js';

export interface AppDeps {
  config: Config;
  store: Store;
  now?: () => number;
  /** Override the summary model call (tests). Defaults to Bedrock when BEDROCK_MODEL_ID is set. */
  converse?: Converse | null;
}

const PUBLIC_DIR = fileURLToPath(new URL('../public', import.meta.url));

const createVisitSchema = z
  .object({
    title: z.string().trim().min(1).max(80),
    contractor: z.string().trim().min(1).max(80),
    deviceId: z.string().trim().min(1).max(120),
    accountId: z.string().trim().min(1).max(120).optional(),
    timeZone: z.string().trim().min(1).max(64).default('UTC'),
    windowStart: z.number().int(),
    windowEnd: z.number().int(),
    earlyGraceMin: z.number().int().min(0).max(120).default(15),
    lateGraceMin: z.number().int().min(0).max(480).default(90),
  })
  .refine((v) => v.windowEnd > v.windowStart, { message: 'The window must end after it starts.' })
  .refine((v) => v.windowEnd - v.windowStart <= 12 * 60 * MINUTE, {
    message: 'Windows longer than 12 hours are not supported.',
  })
  .refine((v) => isValidTimeZone(v.timeZone), { message: 'Unknown time zone.' });

export function createApp(deps: AppDeps) {
  const { config, store } = deps;
  const now = deps.now ?? (() => Date.now());
  const converse: Converse | null =
    deps.converse !== undefined
      ? deps.converse
      : config.bedrockModelId
        ? bedrockConverse(config.bedrockModelId, config.awsRegion)
        : null;

  const app = express();
  app.disable('x-powered-by');
  // Hosts terminate TLS in front of us. Without this, share links would be built as http://.
  app.set('trust proxy', true);

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; script-src 'self'; connect-src 'self'; frame-ancestors 'none'",
    );
    next();
  });

  const baseUrl = (req: Request) => {
    if (config.publicBaseUrl) return config.publicBaseUrl;
    const host = req.get('host') || 'localhost:3000';
    const proto = (req.protocol === 'https' || (!host.includes('localhost') && !host.includes('127.0.0.1'))) ? 'https' : req.protocol;
    return `${proto}://${host}`;
  };
  const findVisit = (id: string): Visit | undefined => store.db.visits.find((v) => v.id === id);
  /** Visit view, plus which simulator scenarios fit it right now (demo mode only). */
  const present = (v: Visit, req: Request, at: number = now()): VisitView & { sim?: unknown } => {
    const view: VisitView & { sim?: unknown } = visitView(v, store.db.deviceLog, at, baseUrl(req), config.signingKey);
    if (config.simulatorEnabled) view.sim = scenarioAvailability(v, at);
    return view;
  };

  app.get('/healthz', (_req, res) => void res.json({ ok: true }));

  // ---- Ring webhook (raw body, because the HMAC covers the exact bytes) ----
  app.post(
    '/webhooks/ring',
    express.raw({ type: 'application/json', limit: '64kb' }),
    (req, res) => {
      const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      const r = ingestWebhook({ config, store, now }, raw, req.header('x-signature'));
      res.status(r.status).json(r.body);
    },
  );

  // ---- Public receipt (token-gated, no auth) ----
  const findShared = (token: string) =>
    store.db.visits.find((v) => v.share && v.share.token === token);

  app.get('/r/:token', async (req, res) => {
    const v = findShared(req.params.token);
    res.setHeader('X-Robots-Tag', 'noindex');
    if (!v) {
      res.status(404).type('html').send(renderGonePage('This receipt link is not valid.'));
      return;
    }
    if (v.share!.revokedAt || v.share!.expiresAt <= now()) {
      res.status(410).type('html').send(renderGonePage('This receipt link has expired or was revoked.'));
      return;
    }
    const receiptUrl = `${baseUrl(req)}/r/${v.share!.token}`;
    const qrSvg = await QRCode.toString(receiptUrl, { type: 'svg', margin: 1, width: 110 }).catch(() => '');
    res.type('html').send(renderReceiptPage(receiptView(v, store.db.deviceLog, now(), baseUrl(req), config.signingKey), qrSvg));
  });

  app.get('/api/receipts/:token', (req, res) => {
    const v = findShared(req.params.token);
    if (!v || v.share!.revokedAt || v.share!.expiresAt <= now()) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json(receiptView(v, store.db.deviceLog, now(), baseUrl(req), config.signingKey));
  });

  // ---- Dashboard API ----
  app.use('/api', express.json({ limit: '32kb' }));
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    const open = req.path === '/config' || req.path.startsWith('/receipts/');
    if (open || !config.dashboardKey) return next();
    if (req.header('x-dashboard-key') === config.dashboardKey) return next();
    res.status(401).json({ error: 'dashboard_key_required' });
  });

  app.get('/api/config', (_req, res) => {
    res.json({
      simulatorEnabled: config.simulatorEnabled,
      bedrockEnabled: !!converse,
      bedrockModelId: config.bedrockModelId,
      keyRequired: !!config.dashboardKey,
      demoAccountId: config.demoAccountId,
      scenarios: config.simulatorEnabled ? SCENARIOS : [],
    });
  });

  app.get('/api/devices', async (_req, res) => {
    if (config.ringAccessToken) {
      try {
        res.json({ source: 'ring', devices: await listDevices(config.ringAccessToken) });
        return;
      } catch (e) {
        res.json({
          source: 'demo',
          warning: `Could not reach the Ring API (${e instanceof Error ? e.message : 'error'}). Showing simulated devices.`,
          devices: DEMO_DEVICES,
        });
        return;
      }
    }
    res.json({ source: 'demo', devices: DEMO_DEVICES });
  });

  app.get('/api/privacy', (_req, res) => {
    res.json({
      kept: store.db.counters.kept,
      discarded: store.db.counters.discarded,
      policy: [
        'Only doorbell presses and people detected at the door are kept.',
        'A signal is kept only if it falls inside the watch period of a visit you booked, on the same door.',
        'Everything else is counted and discarded. Nothing about it is stored.',
        'Camera footage is never requested, stored or shared.',
        'Deleting a visit deletes its signals.',
      ],
    });
  });

  app.get('/api/visits', (req, res) => {
    const t = now();
    const views = store.db.visits
      .slice()
      .sort((a, b) => b.windowStart - a.windowStart)
      .map((v) => present(v, req, t));
    res.json(views);
  });

  app.post('/api/visits', (req, res) => {
    const parsed = createVisitSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_visit', message: parsed.error.issues[0]?.message ?? 'Invalid visit.' });
      return;
    }
    if (store.db.visits.length >= config.maxVisits) {
      res.status(429).json({ error: 'too_many_visits', message: `This workspace is limited to ${config.maxVisits} visits. Delete some first.` });
      return;
    }
    const v: Visit = {
      id: randomUUID(),
      accountId: parsed.data.accountId ?? config.demoAccountId,
      deviceId: parsed.data.deviceId,
      title: parsed.data.title,
      contractor: parsed.data.contractor,
      timeZone: parsed.data.timeZone,
      windowStart: parsed.data.windowStart,
      windowEnd: parsed.data.windowEnd,
      earlyGraceMin: parsed.data.earlyGraceMin,
      lateGraceMin: parsed.data.lateGraceMin,
      createdAt: now(),
      signals: [],
      departureConfirmedAt: null,
      share: null,
      summary: null,
    };
    store.db.visits.push(v);
    store.save();
    res.status(201).json(present(v, req));
  });

  app.get('/api/visits/:id', (req, res) => {
    const v = findVisit(req.params.id);
    if (!v) return void res.status(404).json({ error: 'not_found' });
    res.json(present(v, req));
  });

  app.delete('/api/visits/:id', (req, res) => {
    const i = store.db.visits.findIndex((v) => v.id === req.params.id);
    if (i < 0) return void res.status(404).json({ error: 'not_found' });
    store.db.visits.splice(i, 1);
    store.save();
    res.status(204).end();
  });

  app.post('/api/visits/:id/signals/:signalId/exclude', (req, res) => {
    const v = findVisit(req.params.id);
    const s = v?.signals.find((x) => x.id === req.params.signalId);
    if (!v || !s) return void res.status(404).json({ error: 'not_found' });
    s.excluded = req.body?.excluded !== false;
    v.summary = null; // facts changed, so any old summary is stale
    store.save();
    res.json(present(v, req));
  });

  app.post('/api/visits/:id/confirm-departure', (req, res) => {
    const v = findVisit(req.params.id);
    if (!v) return void res.status(404).json({ error: 'not_found' });
    const first = v.signals.filter((s) => !s.excluded).sort((a, b) => a.at - b.at)[0];
    if (!first) return void res.status(409).json({ error: 'no_arrival', message: 'Nobody has arrived yet.' });
    const at = typeof req.body?.at === 'number' ? req.body.at : now();
    if (at < first.at) return void res.status(400).json({ error: 'before_arrival', message: 'That is before they arrived.' });
    if (at > now() + FUTURE_SKEW_MS) return void res.status(400).json({ error: 'future', message: 'That time is in the future.' });
    v.departureConfirmedAt = at;
    v.summary = null;
    store.save();
    res.json(present(v, req));
  });

  app.post('/api/visits/:id/share', (req, res) => {
    const v = findVisit(req.params.id);
    if (!v) return void res.status(404).json({ error: 'not_found' });
    const days = Math.min(30, Math.max(1, Number(req.body?.days) || 7));
    v.share = { token: randomBytes(24).toString('base64url'), expiresAt: now() + days * 24 * 60 * MINUTE };
    store.save();
    res.status(201).json(present(v, req));
  });

  app.delete('/api/visits/:id/share', (req, res) => {
    const v = findVisit(req.params.id);
    if (!v?.share) return void res.status(404).json({ error: 'not_found' });
    v.share.revokedAt = now();
    store.save();
    res.json(present(v, req));
  });

  app.post('/api/visits/:id/summary', async (req, res) => {
    const v = findVisit(req.params.id);
    if (!v) return void res.status(404).json({ error: 'not_found' });
    const facts = factsFor(v, evaluateVisit(v, store.db.deviceLog, now()));
    v.summary = await buildSummary(facts, converse, now());
    store.save();
    res.json(present(v, req));
  });

  // ---- AWS Bedrock AI Dispute Arbiter ----
  app.post('/api/visits/:id/dispute', async (req, res) => {
    const v = findVisit(req.params.id);
    if (!v) return void res.status(404).json({ error: 'not_found' });
    const claim = String(req.body?.claim || '').trim() || 'Contractor claims arrival during window.';
    const ev = evaluateVisit(v, store.db.deviceLog, now());
    const facts = factsFor(v, ev);
    v.dispute = await buildDisputeAudit(v, ev, facts, claim, converse, now(), config.bedrockModelId || undefined);
    store.save();
    res.json(present(v, req));
  });

  // ---- Cryptographic Evidence Verification ----
  app.get('/api/visits/:id/verify-integrity', (req, res) => {
    const v = findVisit(req.params.id);
    if (!v) return void res.status(404).json({ error: 'not_found' });
    const ev = evaluateVisit(v, store.db.deviceLog, now());
    const currentSeal = generateVerificationSeal(v, ev, config.signingKey);
    const expected = req.query.expected ? String(req.query.expected) : currentSeal.digest;
    const result = verifyEvidenceIntegrity(v, ev, expected, config.signingKey);
    res.json(result);
  });

  // ---- Ring Smart Lock Access Control ----
  app.post('/api/visits/:id/smart-lock/toggle', (req, res) => {
    const v = findVisit(req.params.id);
    if (!v) return void res.status(404).json({ error: 'not_found' });
    const current = v.smartLock?.state;
    if (current === 'revoked') {
      v.smartLock = null; // restored
    } else {
      v.smartLock = {
        pin: '••••',
        state: 'revoked',
        issuedAt: now(),
        expiresAt: v.windowEnd + v.lateGraceMin * MINUTE,
      };
    }
    store.save();
    res.json(present(v, req));
  });

  // ---- Business Systems Outbound Webhooks (Jobber, Stripe, Housecall Pro) ----
  app.post('/api/visits/:id/business-dispatch', (req, res) => {
    const v = findVisit(req.params.id);
    if (!v) return void res.status(404).json({ error: 'not_found' });
    const platform = (req.body?.platform as PlatformTarget) || 'Jobber';
    const ev = evaluateVisit(v, store.db.deviceLog, now());
    const event = createBusinessEvent(v, ev, platform, now());
    if (!store.db.businessLog) store.db.businessLog = [];
    store.db.businessLog.unshift(event);
    if (store.db.businessLog.length > 30) store.db.businessLog.pop();
    store.save();
    res.json({ event, visit: present(v, req) });
  });

  app.get('/api/business-events', (_req, res) => {
    res.json(store.db.businessLog || []);
  });

  // ---- Simulator (development and demo only) ----
  if (config.simulatorEnabled) {
    app.post('/api/dev/demo-visit', (req, res) => {
      const t = now();
      if (store.db.visits.length >= config.maxVisits) {
        return void res.status(429).json({ error: 'too_many_visits', message: 'Too many visits. Use "Reset demo data".' });
      }
      const open = req.body?.kind !== 'ended';
      const v: Visit = {
        id: randomUUID(),
        accountId: config.demoAccountId,
        deviceId: DEMO_DEVICES[0]!.id,
        title: open ? 'Window cleaning' : 'Boiler service',
        contractor: open ? 'Demo Cleaning Co.' : 'Demo Plumbing Ltd.',
        timeZone: isValidTimeZone(String(req.body?.timeZone)) ? String(req.body.timeZone) : 'UTC',
        windowStart: open ? t - 30 * MINUTE : t - 4 * 60 * MINUTE,
        windowEnd: open ? t + 60 * MINUTE : t - 2 * 60 * MINUTE,
        earlyGraceMin: 15,
        lateGraceMin: 90,
        createdAt: t,
        signals: [],
        departureConfirmedAt: null,
        share: null,
        summary: null,
      };
      store.db.visits.push(v);
      store.save();
      res.status(201).json(present(v, req, t));
    });

    app.post('/api/dev/reset', (_req, res) => {
      store.db.visits = [];
      store.db.deviceLog = [];
      store.db.seenRequestIds = [];
      store.db.counters = { kept: 0, discarded: 0 };
      store.db.businessLog = [];
      store.save();
      res.status(204).end();
    });

    app.post('/api/dev/simulate', async (req, res) => {
      const v = findVisit(String(req.body?.visitId));
      const scenario = req.body?.scenario as Scenario;
      if (!v) return void res.status(404).json({ error: 'not_found' });
      if (!SCENARIOS.includes(scenario)) return void res.status(400).json({ error: 'unknown_scenario' });
      try {
        const planned = planScenario(v, scenario, now());
        const url = `http://127.0.0.1:${req.socket.localPort}/webhooks/ring`;
        const results: Array<{ type: string; at: number; http: number }> = [];
        for (const p of planned) {
          const payload = buildRingWebhook({
            accountId: v.accountId,
            deviceId: v.deviceId,
            type: p.type,
            subType: p.subType,
            at: p.at,
            sentAt: now(),
          });
          results.push({ type: p.type, at: p.at, http: await deliverWebhook(url, config.signingKey, payload) });
        }
        res.json({ sent: results, visit: present(v, req) });
      } catch (e) {
        if (e instanceof ScenarioError) return void res.status(409).json({ error: 'scenario_not_possible', message: e.message });
        throw e;
      }
    });
  }

  app.use(express.static(PUBLIC_DIR));

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'internal_error' });
  });

  return app;
}
