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
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Libre+Franklin:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap';

/** Lucide line icon wrapper (same set and sizing as the dashboard). */
function svgIcon(paths: string): string {
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`;
}

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
  const lockIcon = svgIcon(
    lockState === 'active'
      ? '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>'
      : '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  );
  const shieldIcon = svgIcon(
    '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  );

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
      <div class="seal-icon">${shieldIcon}</div>
      <div class="seal-info">
        <h4>Ring Webhook HMAC Verification Seal</h4>
        <p class="seal-fp">Signature Digest: <code>${esc(r.verificationSeal.fingerprint)}</code></p>
        <p class="seal-meta">Tamper-Proof SHA256 &bull; Verified at ${esc(r.verificationSeal.certifiedAt)}</p>
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
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS_HREF}"><link rel="stylesheet" href="/app.css"></head>
<body class="receipt-page"><main class="tape tape-solo"><header class="tape-head"><p class="brand">Doorstep Receipts</p><h1>Receipt unavailable</h1></header>
<p class="headline">${esc(message)}</p><p class="detail">Ask the homeowner to send a new link.</p></main></body></html>`;
}
