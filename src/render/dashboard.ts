export const DASHBOARD_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Doorstep Receipts — Ring Access Control & Verification</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&family=Barlow+Condensed:wght@500;600;700&family=JetBrains+Mono:wght@500;700&display=swap">
<link rel="stylesheet" href="/app.css">
</head>
<body class="app">
<div class="judge-banner">
  <div class="judge-title"><span>🏆 Hackathon Judge Showcase:</span></div>
  <div class="judge-actions">
    <button type="button" class="btn-judge" data-judge="access" title="Simulates in-window arrival, unlocks Smart Lock PIN, and generates verified receipt">1. Access Control (On-Time + PIN)</button>
    <button type="button" class="btn-judge" data-judge="dispute" title="Simulates late arrival dispute audited by Bedrock AI">2. Bedrock AI Dispute Arbiter</button>
    <button type="button" class="btn-judge" data-judge="outage" title="Simulates camera outage to ensure contractor is not unfairly penalized">3. Fair Outage Protection</button>
    <button type="button" class="btn-judge" data-judge="privacy" title="Demonstrates privacy gate discarding outside motion without storing footage">4. Privacy Gate Drop</button>
  </div>
</div>

<header class="masthead">
  <div class="plate"><span>Doorstep Receipts</span></div>
  <p id="mode" class="mode"></p>
</header>

<div class="layout">
  <nav class="visits" aria-label="Visits">
    <div class="visits-head">
      <h2>Visits</h2>
      <button type="button" class="btn primary" data-action="new">New visit</button>
    </div>
    <ul id="visit-list" class="visit-list"></ul>
  </nav>

  <main id="detail" class="detail" aria-live="polite"></main>

  <aside class="side">
    <section id="ledger" class="ledger" aria-labelledby="ledger-h"></section>
    <section id="business-box" class="business-box" aria-labelledby="biz-h"></section>
    <section id="sim" class="sim" aria-labelledby="sim-h" hidden></section>
  </aside>
</div>

<dialog id="new-dialog" class="dialog">
  <form method="dialog" id="new-form">
    <h2>New visit</h2>
    <p class="muted">Pick the door and the arrival window you agreed. Only this period is watched.</p>
    <label>What is the job?
      <input name="title" required maxlength="80" placeholder="Boiler service" autocomplete="off">
    </label>
    <label>Who is coming?
      <input name="contractor" required maxlength="80" placeholder="Company or person" autocomplete="off">
    </label>
    <label>Which door?
      <select name="deviceId" id="device-select" required></select>
    </label>
    <div class="row3">
      <label>Day <input type="date" name="date" required></label>
      <label>Window opens <input type="time" name="start" required></label>
      <label>Window closes <input type="time" name="end" required></label>
    </div>
    <details>
      <summary>Watch time around the window</summary>
      <div class="row2">
        <label>Minutes before it opens <input type="number" name="early" min="0" max="120" value="15"></label>
        <label>Minutes after it closes <input type="number" name="late" min="0" max="480" value="90"></label>
      </div>
      <p class="muted">Late arrivals still count if they reach the door while the door is being watched.</p>
    </details>
    <p id="form-error" class="form-error" role="alert" hidden></p>
    <div class="dialog-actions">
      <button type="button" class="btn" data-action="cancel-new">Cancel</button>
      <button type="submit" class="btn primary">Start watching</button>
    </div>
  </form>
</dialog>

<dialog id="dispute-dialog" class="dialog">
  <form method="dialog" id="dispute-form">
    <h2>⚖️ Amazon Bedrock Dispute Arbiter</h2>
    <p class="muted">Contractors or homeowners can submit a disputed visit claim. Amazon Bedrock evaluates the claim against cryptographic Ring doorbell facts and camera telemetry to provide an impartial settlement recommendation.</p>
    <label>Claim to evaluate:
      <textarea name="claim" id="dispute-claim" rows="3" required placeholder="e.g. I arrived at the door at 9:15 AM and rang twice, but nobody answered."></textarea>
    </label>
    <div class="dispute-presets">
      <span class="muted">Quick test claims:</span>
      <button type="button" class="btn small" data-action="fill-claim" data-claim="I arrived at 9:15 AM and rang the bell twice, but homeowner didn't answer.">"I rang twice at 9:15 AM"</button>
      <button type="button" class="btn small" data-action="fill-claim" data-claim="The camera was dead when I arrived, so the bell didn't log. I shouldn't be charged a no-show fee.">"Camera outage missed me"</button>
    </div>
    <div class="dialog-actions">
      <button type="button" class="btn" data-action="cancel-dispute">Cancel</button>
      <button type="submit" class="btn primary">Run Bedrock Audit</button>
    </div>
  </form>
</dialog>

<div id="toast" class="toast" role="status" aria-live="polite" hidden></div>
<script type="module" src="/app.js"></script>
</body>
</html>
`;
