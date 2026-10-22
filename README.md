# Doorstep Receipts

Proof of arrival, ephemeral access control, and dispute resolution for home services, built on Ring webhooks.

A homeowner books a visit window for a cleaner, plumber, furniture assembler or dog walker:
- **Access Control:** Ring doorstep events inside that window generate an **ephemeral Ring Smart Lock PIN** for keyless contractor entry.
- **Business Systems:** Stamped arrivals fire automated B2B webhooks to **Jobber, Stripe, and Housecall Pro** to release escrow or start billing.
- **Cryptographic Trust:** Generates a tamper-proof **HMAC-SHA256 verification seal & mobile QR code** on contractor receipts without exposing any video.
- **AWS Builder (Amazon Bedrock):** Powers plain-language summaries and an **AI Dispute Arbiter** that settles "I was there, nobody answered" claims by auditing Ring telemetry.

Built for the Ring track of [Build, Ship, Shape: Amazon Developer Hackathon](https://amazonappdev2026.devpost.com/).
Priority categories targeted: **Access Control** and **Business Systems**. Mini-challenges: **AWS Builder** and **Open Source**.

## Quick start

Needs Node 22 or newer.

```bash
npm install
npm start            # http://localhost:3000
```

Open the dashboard and test the **🏆 Hackathon Judge Showcase** top bar:

1. **1. Access Control (On-Time + PIN)**: Creates a visit, simulates doorbell press with chime, issues an ephemeral Smart Lock PIN, and triggers a Jobber release webhook.
2. **2. Bedrock AI Dispute Arbiter**: Audits a late arrival claim ("I was there at 9:15, nobody opened") against Ring ground-truth telemetry and device uptime.
3. **3. Fair Outage Protection**: Demonstrates how camera outage telemetry prevents unfair no-show penalties.
4. **4. Privacy Gate Drop**: Shows outside passer-by motion immediately discarded before database storage (0 bytes retained).

```bash
npm test             # 47 tests: HMAC, Smart Lock, Bedrock Dispute, Webhooks, Privacy Gate
npm run typecheck    # 0 errors
```

## Running it without localhost

See [DEPLOY.md](DEPLOY.md): an instant public URL from your laptop, a hosted demo link for judges,
and an AWS route. A `/healthz` endpoint and a Dockerfile are included.

## How it works

```
Ring doorbell ──webhook──> POST /webhooks/ring
                              │ 1. verify X-Signature (HMAC-SHA256 over the raw body)
                              │ 2. normalize the v1.1 payload
                              │ 3. dedupe on meta.request_id
                              ▼
                        privacy gate ── outside every booked watch period? ──> counted, discarded
                              │
                              ▼ inside one
                        visit.signals ──> evaluateVisit() ──> verdict
                                                              │
                              dashboard (homeowner) <─────────┤
                              /r/:token receipt (contractor) <┘   Bedrock writes the summary
```

**Signals kept:** only `button_press` and `motion_detected` with `subType: human`. Other motion
is discarded on arrival. `device_online` / `device_offline` are kept as device state, because
they decide whether "no one came" can be trusted.

**Verdicts:** in the window, arrived early, arrived late, no arrival detected, or *can't tell*
(the camera was offline for 10 or more minutes while the door was being watched).

**Watch period:** the booked window, plus 15 minutes before and 90 minutes after by default, so
late arrivals are still caught. Both margins are editable per visit.

## Privacy by design

- A signal is stored only if it falls inside the watch period of a visit on the same Ring
  account and the same door. Everything else is counted and dropped. The dashboard shows both
  counters.
- Footage is never requested, stored or shared.
- The contractor's receipt contains verdict, times and doorstep activity. It has no device ids,
  account ids, event ids or dashboard links (covered by a test).
- Receipt links are random 192-bit tokens that expire (default 7 days) and can be revoked.
- The homeowner can mark any signal "Not them" (a neighbour, a delivery) and it is left out.
- Deleting a visit deletes its signals.

## Honest limits

- A doorbell sees someone arrive. It cannot see them leave by another door. Time on site is
  shown as an **estimate** unless the homeowner confirms departure with one tap.
- "No arrival detected" is not proof nobody came, and the receipt says so.
- A receipt shows that *someone* was at the door. It cannot say who.

## Configuration

Copy `.env.example` to `.env` or set variables directly.

| Variable | Purpose |
| --- | --- |
| `RING_WEBHOOK_SIGNING_KEY` | HMAC key from your Ring partner credentials. Required when `NODE_ENV=production`. Defaults to `dev-signing-key` in development. |
| `DEMO_ACCOUNT_ID` | Ring account id the demo visits and simulator use. |
| `RING_ACCESS_TOKEN` | Optional OAuth bearer token. Fills the device picker from `GET https://api.amazonvision.com/v1/devices`. |
| `BEDROCK_MODEL_ID`, `AWS_REGION` | Turns on Amazon Bedrock summaries via the Converse API. Without them a deterministic template is used. |
| `DASHBOARD_API_KEY` | If set, `/api` calls need an `x-dashboard-key` header. Public receipts stay open. |
| `ENABLE_SIMULATOR` | Defaults to on outside production. Keep it on for a public judging demo; turn it off when real Ring traffic is connected. |
| `MAX_VISITS` | Cap on stored visits (default 200), so a public demo cannot fill the disk. |
| `PUBLIC_BASE_URL`, `PORT`, `DATA_FILE` | Share-link base URL, port, and the JSON data file path. |

### Bedrock summaries

The model receives a small JSON of facts and nothing else (no ids, no footage). Its output is
rejected, and the template used instead, if it mentions a clock time that is not in those facts
or if the call fails. A receipt never breaks because a model call did.

## Connecting real Ring events

1. Register a Ring partner integration and get your HMAC signing key. Set
   `RING_WEBHOOK_SIGNING_KEY`.
2. Deploy somewhere with a public HTTPS endpoint (TLS 1.2 or newer). Ring must be able to reach
   `POST /webhooks/ring`, and the handler must answer within 5 seconds (it does: all work is
   synchronous and in-memory).
3. Give Ring that URL during partner onboarding.
4. Set `NODE_ENV=production`, `ENABLE_SIMULATOR=false` and `DASHBOARD_API_KEY`.
5. Create visits with the real device id and `meta.account_id` of the Ring account.

## Layout

```
src/ring/        HMAC verify, webhook v1.1 normalizer, minimal API client
src/domain/      privacy gate + verdict logic, summary (Bedrock + template), formatting
src/ingest.ts    the webhook pipeline
src/app.ts       Express API, public receipt, simulator endpoints
src/simulator.ts webhook builder, scenario planner, CLI
public/          dashboard (vanilla JS, no build step)
test/            unit and end-to-end tests
```

## What is verified and what is not

Verified in this repo: webhook payload and HMAC handling follow the Ring Partner API docs;
the pipeline, verdict logic, privacy gate, receipts and simulator are covered by tests; the
dashboard script was exercised end to end in jsdom against a running server.

Not verified: delivery from a live Ring account (no partner credentials were available when this
was built), device attribute names returned by `GET /v1/devices`, real Bedrock calls (tested with
an injected fake), and the visual layout in a real browser. Check those first.

Not implemented: Ring OAuth account linking, multi-user accounts, payments, and a database
beyond a JSON file. To run more than one instance, replace `Store` with DynamoDB.

## License

MIT
