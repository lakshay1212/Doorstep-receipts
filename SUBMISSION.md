# Submission kit

Everything below is a draft. Replace anything that does not match what you actually did, and
read the official rules for the exact requirements before you submit.

## Checklist

- [x] Track: Ring (primary). Priority categories: Access Control & Business Systems.
- [x] Mini challenges: AWS Builder (Amazon Bedrock), Open Source.
- [ ] Repo is public with the MIT license, **or** private and shared with the reviewers.
- [ ] Demo video, English, public, under 3 minutes, no copyrighted music. Shows the simulator or a real Ring device.
- [x] Text description (below), project name, thumbnail.
- [x] Product feedback for every tool you used (Ring, Bedrock, anything else).
- [x] Friction log filled in from your own experience.
- [x] **AWS Builder:** set `BEDROCK_MODEL_ID` (Converse API), featuring Bedrock visit summaries AND Bedrock AI Dispute Arbiter.
- [ ] **Open Source:** open a small PR to a public repo (a docs fix or sample from your friction log), and link it.
- [ ] Public demo link (see DEPLOY.md) in the "Try it out" links, with the testing instructions below.
- [ ] Submit a day early. The deadline is Oct 23, 12:00 PM PDT.

## Testing instructions for judges

No login or hardware needed. Open the demo link and use the **🏆 Hackathon Judge Showcase** top bar:

1. Click **1. Access Control (On-Time + PIN)**: Creates a visit, simulates an in-window doorbell press with web audio chime, issues an ephemeral Ring Smart Lock keypad PIN, mints a verified receipt with a mobile QR code, and dispatches a B2B webhook to Jobber to release escrow.
2. Click **2. Bedrock AI Dispute Arbiter**: Evaluates a late arrival dispute ("I was there at 9:15, nobody opened") against cryptographic Ring ground-truth telemetry and offline spans, outputting an impartial resolution memo.
3. Click **3. Fair Outage Protection**: Demonstrates how camera outage telemetry prevents unfair no-show strikes against contractors.
4. Click **4. Privacy Gate Drop**: Shows outside passer-by motion immediately discarded before database storage (0 bytes retained).

## Devpost description

**Inspiration.** Home-service visits run on trust and friction. Cleaners say they came and nobody answered. Homeowners say nobody showed up. Platforms like Jobber and Stripe need verified arrival proof before releasing funds or unlocking doors. Neither side wants to share private security footage.

**What it does.** Doorstep Receipts turns Ring doorstep events into verified proof-of-arrival receipts, temporary access control, and business system automation:
- **Access Control:** Verified in-window arrivals automatically issue a time-boxed, ephemeral Ring Smart Lock PIN. Outside arrivals remain locked.
- **Business Systems:** Dispatches real-time webhooks to field service platforms (Jobber, Stripe, Housecall Pro) for escrow release or SLA tracking.
- **Cryptographic Trust:** Generates an HMAC-SHA256 verification seal and scannable mobile QR pass on every contractor receipt without revealing video or device IDs.
- **AWS Builder (Amazon Bedrock):** Powers plain-language visit summaries and an AI Dispute Arbiter that audits contractor claims against ground-truth Ring telemetry.

**How we built it.** A Node 22 and TypeScript service receives Ring webhook v1.1 deliveries, verifies HMAC-SHA256 signatures over raw request bytes, dedupes on `request_id`, and enforces a privacy gate. Amazon Bedrock Converse API analyzes visits and disputes with strict grounding guardrails. A built-in simulator with Web Audio feedback allows judges to test the full pipeline without hardware.

**Challenges.** (Write your own. Candidates: no official simulator, inconsistent event lists in
the docs, deciding what a doorbell can honestly prove about departure.)

**Accomplishments.** Privacy as a design constraint rather than a setting: the gate drops data
before storage, and the dashboard shows exactly how much was kept versus discarded. The product
refuses to claim more than the sensor can show.

**What we learned.** (Write your own.)

**What's next.** Ring OAuth account linking, contractor-side scheduling, multiple properties,
and a departure or dwell event from Ring to replace the time-on-site estimate.

## Demo video script (about 2:45)

| Time | Show | Say |
| --- | --- | --- |
| 0:00 | A message thread: "I came at 9, nobody answered." / "You never showed." | Home-service visits run on he-said-she-said. |
| 0:15 | Dashboard, create a visit (job, contractor, door, 9:00 to 11:00). | The homeowner books a window. Only this period is watched. |
| 0:35 | Simulate: contractor arrives late. The stamp and timeline fill in. | A Ring doorbell press arrives as a signed webhook. Here is the verified verdict. |
| 1:05 | Show the terminal or code for the HMAC check and privacy gate, briefly. | Every delivery is signature-checked. Signals outside a booked window are dropped before storage. |
| 1:25 | Click the passer-by event. Discarded counter increments, kept does not. | A neighbour walks past. Counted, never stored. |
| 1:45 | Camera goes offline on another visit. Stamp reads "Can't tell". | If the camera was offline, we do not pretend to know. |
| 2:05 | Write summary (Bedrock), create link, open the contractor's receipt in a private window. | Bedrock writes the summary from facts only. The contractor sees the receipt, not the footage. |
| 2:30 | Mark a signal "Not them", confirm departure. Receipt updates. | The homeowner keeps the final say. |
| 2:45 | Title card with the repo link. | |

## Product feedback (draft: edit to match your experience)

**Ring Partner API**
- Worked well: the v1.1 webhook format, HMAC signing over raw bytes, `request_id` for idempotency, and the documented retry schedule with a 72-hour dead-letter window.
- Friction: no official SDK or simulator, so every integrator rebuilds a signing and replay harness. The event list differs between doc pages, and the placement of `subType` needs a published schema.
- Requests: a sandbox that can inject and replay events, a departure or dwell event, JSON Schemas for each payload, and scoped, expiring sharing of event data with third parties.

**Amazon Bedrock**
- (Fill in: which model, how Converse worked for you, latency, anything surprising.)
