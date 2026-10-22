import type { ReceiptView } from '../views.js';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&family=Barlow+Condensed:wght@500;600;700&family=JetBrains+Mono:wght@500;700&display=swap';

export function renderReceiptPage(r: ReceiptView, qrSvg: string = ''): string {
  const rows: string[] = [];
  const row = (k: string, v: string | null) => {
    if (v) rows.push(`<div class="fact"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`);
  };
  row('Booked window', r.windowLabel);
  row('Door watched', r.watchLabel);
  row('First at the door', r.arrivalLabel);
  row('Time on site', r.onSiteLabel);
  if (r.offlineMinutes >= 1) row('Camera offline', `${r.offlineMinutes} min`);

  const timeline = r.signals.length
    ? `<ol class="timeline">${r.signals
        .map((s) => `<li><span class="t">${esc(s.timeLabel)}</span><span>${esc(s.label)}</span></li>`)
        .join('')}</ol>`
    : '<p class="muted">No doorstep activity recorded.</p>';

  const lockState = r.smartLock.state;
  const lockIcon = lockState === 'active' ? '🔓' : '🔒';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Receipt ${esc(r.receiptNo)}: ${esc(r.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS_HREF}">
<link rel="stylesheet" href="/app.css">
</head>
<body class="receipt-page">
<main class="tape tape-solo outcome-${esc(r.outcome)}">
  <header class="tape-head">
    <div class="tape-head-row">
      <div>
        <p class="brand">Doorstep Receipts</p>
        <p class="receipt-no">Receipt ${esc(r.receiptNo)}</p>
        <h1>${esc(r.title)}</h1>
        <p class="who">${esc(r.contractor)}</p>
      </div>
      ${qrSvg ? `<div class="qr-block" title="Scan to open on smartphone">${qrSvg}<span class="qr-sub">Scan on mobile</span></div>` : ''}
    </div>
  </header>

  <div class="stamp" role="img" aria-label="Verdict: ${esc(r.outcomeLabel)}"><span>${esc(r.outcomeLabel)}</span></div>
  <p class="headline">${esc(r.headline)}</p>
  <p class="detail">${esc(r.detail)}</p>
  <dl class="facts">${rows.join('')}</dl>

  <!-- Access Control: Ring Smart Lock Integration -->
  <section class="access-box access-${esc(lockState)}" aria-label="Smart Lock Access Control">
    <div class="access-head">
      <span class="access-icon">${lockIcon}</span>
      <div>
        <h3>Ring Smart Lock Access</h3>
        <span class="access-badge badge-${esc(lockState)}">${esc(lockState.toUpperCase())}</span>
      </div>
    </div>
    ${lockState === 'active' ? `
      <div class="pin-wrapper">
        <span class="pin-hint">One-time Door Keypad Code:</span>
        <span class="pin-code">${esc(r.smartLock.pin)}</span>
      </div>
    ` : ''}
    <p class="access-msg">${esc(r.smartLock.message)}</p>
  </section>

  <section aria-labelledby="tl">
    <h2 id="tl">Doorstep activity</h2>
    ${timeline}
    ${r.signalsMarkedNotThem ? `<p class="muted">The homeowner reviewed the log and marked ${r.signalsMarkedNotThem} ${r.signalsMarkedNotThem === 1 ? 'signal' : 'signals'} as not the contractor. Those are left out.</p>` : ''}
  </section>

  ${r.summary ? `<section aria-labelledby="sm"><h2 id="sm">Summary</h2><p class="summary">${esc(r.summary)}</p></section>` : ''}

  <!-- Cryptographic Trust & Verification Seal -->
  <section class="seal-box" aria-label="Cryptographic Verification">
    <div class="seal-inner">
      <div class="seal-icon">🛡️</div>
      <div class="seal-info">
        <h4>Ring Webhook HMAC Verification Seal</h4>
        <p class="seal-fp">Signature Digest: <code>${esc(r.verificationSeal.fingerprint)}</code></p>
        <p class="seal-meta">Tamper-Proof SHA256 • Verified at ${esc(r.verificationSeal.certifiedAt)}</p>
      </div>
    </div>
  </section>

  <footer class="tape-foot">
    ${r.caveats.map((c) => `<p>${esc(c)}</p>`).join('')}
    <p>This link expires ${esc(r.expiresLabel)}.</p>
    <button type="button" class="print-btn" data-print>Print or save as PDF</button>
  </footer>
</main>
<script src="/receipt.js" defer></script>
</body>
</html>`;
}

export function renderGonePage(message: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>Receipt unavailable</title>
<link rel="stylesheet" href="${FONTS_HREF}"><link rel="stylesheet" href="/app.css"></head>
<body class="receipt-page"><main class="tape tape-solo"><header class="tape-head"><p class="brand">Doorstep Receipts</p><h1>Receipt unavailable</h1></header>
<p class="headline">${esc(message)}</p><p class="detail">Ask the homeowner to send a new link.</p></main></body></html>`;
}
