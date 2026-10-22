const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const enc = encodeURIComponent;

/* Lucide line icons (inline, 24px grid, 2px stroke) — the only icon set used. */
const ICONS = {
  'lock-open': '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  'shield-check': '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  scale: '<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  play: '<polygon points="6 3 20 12 6 21 6 3"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  send: '<path d="M14.54 21.69a.5.5 0 0 0 .94-.03l6.5-19a.5.5 0 0 0-.64-.64l-19 6.5a.5.5 0 0 0-.03.94l7.93 3.18a2 2 0 0 1 1.11 1.11z"/><path d="m21.85 2.15-10.94 10.93"/>',
  'file-text': '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>',
  'log-out': '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  'rotate-ccw': '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  bell: '<path d="M10.27 21a2 2 0 0 0 3.46 0"/><path d="M3.26 15.33A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.67C19.41 13.96 18 12.5 18 8A6 6 0 0 0 6 8c0 4.5-1.41 5.96-2.74 7.33"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
};
const icon = (name, cls = 'icon') =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name] || ''}</svg>`;

/* Button that triggered the in-flight request; gets the shared loading state. */
let pendingBtn = null;

const SCENARIO_LABELS = {
  arrive_early: 'Contractor arrives early',
  arrive_on_time: 'Contractor arrives in the window',
  arrive_late: 'Contractor arrives late',
  leave: 'Person seen leaving',
  doorbell_now: 'Doorbell pressed now',
  person_now: 'Person at the door now',
  camera_offline: 'Camera goes offline',
  camera_online: 'Camera comes back online',
  passerby_outside_windows: 'Passer-by, outside any visit',
};

const state = {
  config: null,
  visits: [],
  privacy: null,
  devices: [],
  selected: null,
  seen: new Set(),
  snapshot: '',
  businessEvents: [],
  showPayload: {},
};
let dashKey = sessionStorage.getItem('dashKey') || '';

function playDoorbellChime() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const now = ctx.currentTime;

    // Ding (high tone E5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(659.25, now);
    gain1.gain.setValueAtTime(0.2, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.7);

    // Dong (low tone C5)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(523.25, now + 0.32);
    gain2.gain.setValueAtTime(0.2, now + 0.32);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 1.3);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.32);
    osc2.stop(now + 1.3);
  } catch (_) {}
}

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: { 'content-type': 'application/json', ...(dashKey ? { 'x-dashboard-key': dashKey } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401) {
    const k = prompt('Enter the dashboard key');
    if (!k) throw new Error('A dashboard key is required.');
    dashKey = k;
    sessionStorage.setItem('dashKey', k);
    return api(path, { method, body });
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || `Request failed (${res.status})`);
  return data;
}

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 4800);
}

const selectedVisit = () => state.visits.find((v) => v.id === state.selected) || null;

/* ---------- rendering ---------- */
function statusText(v) {
  if (v.outcome === 'pending') return v.phase === 'scheduled' ? 'Scheduled' : 'Watching the door';
  return v.outcomeLabel;
}

function updateHtml(el, newHtml) {
  if (el && el.innerHTML !== newHtml) {
    el.innerHTML = newHtml;
  }
}

function renderList() {
  const list = $('#visit-list');
  if (!list) return;
  if (!state.visits.length) {
    updateHtml(list, '<li class="empty">No visits yet. Create one to start watching a door.</li>');
    return;
  }
  const html = state.visits
    .map(
      (v) => `<li><button type="button" class="visit outcome-${esc(v.outcome)}${v.id === state.selected ? ' is-selected' : ''}" data-action="select" data-visit="${esc(v.id)}">
        <span class="visit-title">${esc(v.title)}</span>
        <span class="visit-meta">${esc(v.contractor)}</span>
        <span class="visit-when">${esc(v.windowLabel)}</span>
        <span class="visit-status">${esc(statusText(v))}</span>
      </button></li>`,
    )
    .join('');
  updateHtml(list, html);
}

function factRows(v) {
  const rows = [
    ['Booked window', v.windowLabel],
    ['Door watched', v.watchLabel],
    ['First at the door', v.arrivalLabel],
    ['Time on site', v.onSiteLabel],
    ['Left', v.departureLabel ? `${v.departureLabel} (confirmed)` : null],
    ['Camera offline', v.offlineMinutes >= 1 ? `${v.offlineMinutes} min` : null],
  ];
  return rows
    .filter((r) => r[1])
    .map(([k, val]) => `<div class="fact"><dt>${esc(k)}</dt><dd>${esc(val)}</dd></div>`)
    .join('');
}

function smartLockHtml(v) {
  const sl = v.smartLock;
  if (!sl) return '';
  const lockIcon = icon(sl.state === 'active' ? 'lock-open' : 'lock');
  return `
    <div class="access-box access-${esc(sl.state)}">
      <div class="access-head">
        <span class="access-icon">${lockIcon}</span>
        <div>
          <h3>Ring Smart Lock Access</h3>
          <span class="access-badge badge-${esc(sl.state)}">${esc(sl.state.toUpperCase())}</span>
        </div>
      </div>
      ${sl.state === 'active' ? `
        <div class="pin-wrapper">
          <span class="pin-hint">Ephemeral Keypad PIN:</span>
          <span class="pin-code">${esc(sl.pin)}</span>
        </div>
        <p class="access-msg">One-time entry authorized for in-window arrival. Expires when window closes or departure confirmed.</p>
      ` : `
        <p class="access-msg">${sl.state === 'revoked' ? 'Access was revoked by homeowner.' : 'Smart Lock remains locked. Temporary PINs are only generated for verified on-time visits.'}</p>
      `}
      <div class="action-row">
        <button type="button" class="btn small${sl.state === 'revoked' ? ' primary' : ' danger'}" data-action="toggle-lock">
          ${icon(sl.state === 'revoked' ? 'lock-open' : 'lock')}${sl.state === 'revoked' ? 'Restore access PIN' : 'Revoke keypad access'}
        </button>
      </div>
    </div>
  `;
}

function verificationHtml(v) {
  const s = v.verification;
  if (!s) return '';
  return `
    <div class="seal-box">
      <div class="seal-inner">
        <div class="seal-icon">${icon('shield-check')}</div>
        <div class="seal-info">
          <h4>Ring Webhook HMAC Verification Seal</h4>
          <p class="seal-fp">Signature: <code>${esc(s.fingerprint)}</code> (${esc(s.algorithm)})</p>
          <p class="seal-meta">Tamper-Proof SHA256 • Certified at ${esc(s.certifiedAt)}</p>
          <div class="action-row">
            <button type="button" class="btn small" data-action="check-integrity" data-visit="${esc(v.id)}">
              ${icon('check')}Verify Evidence Integrity
            </button>
          </div>
          ${state.integrityCheck && state.integrityCheck.visitId === v.id ? `
            <div class="integrity-report ${state.integrityCheck.verified ? 'report-pass' : 'report-fail'}">
              <strong>${state.integrityCheck.verified ? `${icon('check')}Integrity Verified: 100% Authentic` : `${icon('alert')}Tamper Detected: Hash Mismatch`}</strong>
              <p class="muted">Canonical Hash: <code>${esc(state.integrityCheck.computedDigest.slice(0, 16))}...</code></p>
              ${state.integrityCheck.failureReason ? `<p class="form-error">${esc(state.integrityCheck.failureReason)}</p>` : ''}
            </div>
          ` : ''}
        </div>
      </div>
    </div>
  `;
}

function disputeHtml(v) {
  const d = v.dispute;
  if (!d) return '';
  const verdictClass = `verdict-${esc(d.verdict.toLowerCase())}`;
  const modelLabel = d.source === 'bedrock'
    ? `Amazon Bedrock (${d.modelId || state.config.bedrockModelId || 'Converse API'})`
    : 'Deterministic Grounded Arbiter (Offline Guardrail)';

  return `
    <div class="dispute-card">
      <div class="dispute-card-head">
        <h3>${icon('scale')}Amazon Bedrock Dispute Audit</h3>
        <span class="verdict-tag ${verdictClass}">${esc(d.verdict.toUpperCase())} (${Math.round(d.confidence * 100)}% confidence)</span>
      </div>
      <p class="dispute-claim">Claim: "${esc(d.contractorClaim)}"</p>
      <p class="dispute-analysis">${esc(d.analysis)}</p>
      <p class="dispute-settlement"><b>Recommended Settlement:</b> ${esc(d.recommendedSettlement)}</p>
      
      ${d.evidenceReferences && d.evidenceReferences.length ? `
        <div class="dispute-evidence">
          <strong>Evidence References:</strong>
          <ul>${d.evidenceReferences.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>
        </div>
      ` : ''}

      ${d.limitations && d.limitations.length ? `
        <div class="dispute-limitations">
          <strong>Sensor Boundaries & Limitations:</strong>
          <ul>${d.limitations.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
        </div>
      ` : ''}

      <div class="dispute-footer">
        <p class="dispute-source">Engine: <strong>${esc(modelLabel)}</strong></p>
        ${d.structuredEvidence ? `
          <button type="button" class="biz-json-toggle" data-action="toggle-dispute-evidence">
            ${state.showDisputeEvidence ? 'Hide Structured Evidence JSON' : 'Inspect Structured Evidence JSON fed to Bedrock'}
          </button>
          ${state.showDisputeEvidence ? `<pre class="biz-payload">${esc(JSON.stringify(d.structuredEvidence, null, 2))}</pre>` : ''}
        ` : ''}
      </div>
    </div>
  `;
}

function timelineHtml(v) {
  if (!v.signals.length) return '<p class="muted">Nothing at the door yet.</p>';
  return `<ol class="timeline">${v.signals
    .map((s) => {
      const fresh = state.seen.size && !state.seen.has(s.id) ? ' is-new' : '';
      return `<li class="sig kind-${esc(s.kind)}${s.excluded ? ' is-excluded' : ''}${fresh}">
        <span class="mark"></span>
        <span class="t">${esc(s.timeLabel)}</span>
        <span class="what">${esc(s.label)}</span>
        <button type="button" class="link" data-action="${s.excluded ? 'restore' : 'exclude'}" data-signal="${esc(s.id)}">${s.excluded ? 'Count it again' : 'Not them'}</button>
      </li>`;
    })
    .join('')}</ol>`;
}

function renderDetail() {
  const el = $('#detail');
  const v = selectedVisit();
  if (!v) {
    const demo = state.config.simulatorEnabled
      ? `<button type="button" class="btn primary" data-action="demo-story">${icon('play')}Try the demo</button> `
      : '';
    el.innerHTML = `<div class="tape tape-empty"><span class="empty-icon">${icon('file-text')}</span><h1>Nothing to show yet</h1>
      <p class="detail">Create a visit with an arrival window. Doorstep activity inside that window becomes a receipt you can share.${state.config.simulatorEnabled ? ' Or test one of the Judge Showcase scenarios above.' : ''}</p>
      <p class="empty-cta">${demo}<button type="button" class="btn${demo ? '' : ' primary'}" data-action="new">${icon('plus')}New visit</button></p></div>`;
    return;
  }
  const shareActive = v.share && v.share.active;
  const summarySrc = v.summary
    ? v.summary.source === 'bedrock'
      ? 'Written with Amazon Bedrock from the facts above.'
      : 'Template summary built from the facts above.'
    : '';

  const detailHtml = `
    <article class="tape outcome-${esc(v.outcome)}" aria-label="Receipt ${esc(v.receiptNo)}">
      <header class="tape-head">
        <p class="brand">Doorstep Receipts</p>
        <p class="receipt-no">Receipt ${esc(v.receiptNo)}</p>
        <h1>${esc(v.title)}</h1>
        <p class="who">${esc(v.contractor)}</p>
      </header>
      <div class="stamp" role="img" aria-label="Verdict: ${esc(v.outcomeLabel)}"><span>${esc(v.outcomeLabel)}</span></div>
      <p class="headline">${esc(v.headline)}</p>
      <p class="detail">${esc(v.detail)}</p>
      <dl class="facts">${factRows(v)}</dl>

      <!-- Access Control Feature (Ring Smart Lock) -->
      ${smartLockHtml(v)}

      <h2>Doorstep activity</h2>
      ${timelineHtml(v)}

      <!-- Amazon Bedrock Features -->
      ${v.summary ? `<h2>Summary</h2><p class="summary">${esc(v.summary.text)}</p><p class="summary-src">${esc(summarySrc)}</p>` : ''}
      ${disputeHtml(v)}

      <!-- Cryptographic Trust Seal -->
      ${verificationHtml(v)}

      <footer class="tape-foot">
        <p>Only doorbell presses and people detected at the door are recorded. No footage is stored or shared.</p>
      </footer>
    </article>

    <section class="actions" aria-label="Actions for this visit">
      <div class="action-row">
        ${v.canConfirmDeparture ? `<button type="button" class="btn primary" data-action="depart">${icon('log-out')}Confirm they have left</button>` : ''}
        <button type="button" class="btn" data-action="summary">${icon('file-text')}${v.summary ? 'Rewrite summary' : 'Write summary'}</button>
        <button type="button" class="btn" data-action="open-dispute">${icon('scale')}Audit claim (Bedrock)</button>
      </div>
      <div class="share-box">
        ${
          shareActive
            ? `<label for="share-url"><b>Receipt link for ${esc(v.contractor)} (with QR Code)</b></label>
               <input id="share-url" readonly value="${esc(v.share.url)}">
               <div class="action-row">
                 <button type="button" class="btn small" data-action="copy">${icon('copy')}Copy link</button>
                 <a class="btn small" href="${esc(v.share.url)}" target="_blank" rel="noopener">${icon('external')}Open Receipt</a>
                 <button type="button" class="btn small danger" data-action="revoke">${icon('trash')}Revoke</button>
               </div>
               <p class="muted">Expires ${esc(v.share.expiresLabel)}. Contractor sees proof, Smart Lock PIN (if in-window), and QR pass.</p>`
            : `<div class="action-row"><button type="button" class="btn primary" data-action="share">${icon('link')}Create receipt link & QR</button></div>
               <p class="muted">${v.share ? 'The last link has expired or was revoked. ' : ''}Generate a shareable receipt link for ${esc(v.contractor)}.</p>`
        }
      </div>
      <div class="action-row action-row-end"><button type="button" class="btn small danger" data-action="delete">${icon('trash')}Delete visit and its data</button></div>
    </section>`;
  updateHtml(el, detailHtml);
}

function renderSide() {
  const p = state.privacy;
  updateHtml($('#ledger'), p
    ? `<h2 id="ledger-h">Privacy Gate</h2>
       <div class="ledger-figures"><div><b>${p.kept}</b><span>signals kept</span></div><div><b>${p.discarded}</b><span>discarded</span></div></div>
       <ul>${p.policy.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`
    : '');

  const v = selectedVisit();

  // Business systems box
  const bizBox = $('#business-box');
  const bizHtml = `
    <h2 id="biz-h">Business Systems Integration</h2>
    <p>Dispatch verified arrival events to field service platforms (Jobber, Stripe, Housecall Pro).</p>
    <div class="biz-actions">
      <select id="biz-platform-select" class="biz-select">
        <option value="Jobber">Jobber (Field Service)</option>
        <option value="Stripe">Stripe (Escrow Release)</option>
        <option value="Housecall Pro">Housecall Pro</option>
        <option value="Custom">Custom Webhook</option>
      </select>
      <button type="button" class="btn small" data-action="dispatch-biz"${!v ? ' disabled' : ''}>${icon('send')}Dispatch Webhook</button>
    </div>
    <div class="biz-log">
      ${
        state.businessEvents.length
          ? state.businessEvents.map((evt) => `
              <div class="biz-item">
                <div class="biz-item-head">
                  <span class="biz-event-type">${esc(evt.eventType)}</span>
                  <span class="biz-platform">${esc(evt.platform)}</span>
                </div>
                <div class="muted">${new Date(evt.timestamp).toLocaleTimeString()} • ${esc(evt.status)}</div>
                <button type="button" class="biz-json-toggle" data-action="toggle-payload" data-evt="${esc(evt.id)}">
                  ${state.showPayload[evt.id] ? 'Hide payload' : 'View payload'}
                </button>
                ${state.showPayload[evt.id] ? `<pre class="biz-payload">${esc(JSON.stringify(evt.payload, null, 2))}</pre>` : ''}
              </div>
            `).join('')
          : '<p class="muted">No business webhooks dispatched yet.</p>'
      }
    </div>
  `;
  updateHtml(bizBox, bizHtml);

  const sim = $('#sim');
  if (!state.config.simulatorEnabled) {
    sim.hidden = true;
    return;
  }
  sim.hidden = false;
  const avail = (v && v.sim) || {};
  const scenarioBtn = (sc) => {
    const why = avail[sc];
    return `<button type="button" class="btn small" data-action="sim" data-scenario="${esc(sc)}"${why ? ` disabled title="${esc(why)}"` : ''}>
      <span class="label">${esc(SCENARIO_LABELS[sc] || sc)}</span>${why ? `<span class="why">${esc(why)}</span>` : ''}</button>`;
  };
  const simHtml = `<h2 id="sim-h">Simulate Ring Doorbell</h2>
    <p>Signed HMAC Ring webhook v1.1 payloads.</p>
    <div class="sim-group">
      <h3>Quick presets</h3>
      <button type="button" class="btn small primary" data-action="demo-story">${icon('play')}<span class="label">Play on-time story</span></button>
      <button type="button" class="btn small" data-action="demo-open">${icon('clock')}<span class="label">Window open now</span></button>
      <button type="button" class="btn small" data-action="demo-ended">${icon('clock')}<span class="label">Window already ended</span></button>
    </div>
    <div class="sim-group">
      <h3>Events for selected visit</h3>
      ${v ? state.config.scenarios.map(scenarioBtn).join('') : '<p class="muted">Select a visit first.</p>'}
      ${v ? '<p class="muted">Disabled scenarios do not fit this window.</p>' : ''}
    </div>
    <div class="sim-group">
      <button type="button" class="btn small danger" data-action="demo-reset">${icon('rotate-ccw')}<span class="label">Reset demo data</span></button>
    </div>`;
  updateHtml(sim, simHtml);
}

function renderAll() {
  renderList();
  renderDetail();
  renderSide();
  const v = selectedVisit();
  if (v && v.signals) {
    for (const s of v.signals) state.seen.add(s.id);
  }
}

/* ---------- data ---------- */
async function refresh({ force = false } = {}) {
  const [visits, privacy, bizEvents] = await Promise.all([
    api('/api/visits'),
    api('/api/privacy'),
    api('/api/business-events').catch(() => []),
  ]);
  if (visits && visits.length) {
    const map = new Map(state.visits.map((v) => [v.id, v]));
    for (const v of visits) map.set(v.id, v);
    state.visits = Array.from(map.values());
  }
  if (!state.selected || !state.visits.some((v) => v.id === state.selected)) {
    state.selected = state.visits[0]?.id ?? null;
  }
  const snap = JSON.stringify([state.visits, privacy, bizEvents, state.selected]);
  if (!force && snap === state.snapshot) return;
  state.snapshot = snap;
  state.privacy = privacy;
  state.businessEvents = bizEvents;
  renderAll();
}

async function act(fn, okMsg) {
  const btn = pendingBtn;
  pendingBtn = null;
  if (btn) { btn.classList.add('is-loading'); btn.setAttribute('aria-busy', 'true'); }
  try {
    await fn();
    await refresh({ force: true });
    if (okMsg) toast(okMsg);
  } catch (e) {
    toast(e.message);
  } finally {
    if (btn) { btn.classList.remove('is-loading'); btn.removeAttribute('aria-busy'); }
  }
}

/* ---------- new visit form ---------- */
function openNewVisit() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const start = new Date(now);
  start.setMinutes(0, 0, 0);
  const end = new Date(start.getTime() + 2 * 3600e3);
  const f = $('#new-form');
  f.date.value = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
  f.start.value = `${pad(start.getHours())}:00`;
  f.end.value = `${pad(end.getHours())}:00`;
  $('#device-select').innerHTML = state.devices.map((d) => `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join('');
  $('#form-error').hidden = true;
  $('#new-dialog').showModal();
}

$('#new-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const windowStart = new Date(`${f.date.value}T${f.start.value}`).getTime();
  const windowEnd = new Date(`${f.date.value}T${f.end.value}`).getTime();
  const err = $('#form-error');
  if (!(windowEnd > windowStart)) {
    err.textContent = 'The window must close after it opens.';
    err.hidden = false;
    return;
  }
  try {
    const v = await api('/api/visits', {
      method: 'POST',
      body: {
        title: f.title.value,
        contractor: f.contractor.value,
        deviceId: f.deviceId.value,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        windowStart,
        windowEnd,
        earlyGraceMin: Number(f.early.value || 0),
        lateGraceMin: Number(f.late.value || 0),
      },
    });
    state.selected = v.id;
    $('#new-dialog').close();
    f.reset();
    await refresh({ force: true });
    toast('Watching the door for this window.');
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
  }
});

// Dispute form submit
$('#dispute-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const v = selectedVisit();
  if (!v) return;
  const claim = $('#dispute-claim').value;
  $('#dispute-dialog').close();
  await act(async () => {
    await api(`/api/visits/${enc(v.id)}/dispute`, { method: 'POST', body: { claim } });
  }, 'Bedrock AI dispute audit completed.');
});

/* ---------- judge walkthrough scenarios ---------- */
async function runJudgeScenario(type) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  try {
    if (type === 'access') {
      // 1. On time arrival + Smart lock access + Jobber dispatch
      const created = await api('/api/dev/demo-visit', { method: 'POST', body: { kind: 'open', timeZone: tz } });
      state.selected = created.id;
      playDoorbellChime();
      await api('/api/dev/simulate', { method: 'POST', body: { visitId: created.id, scenario: 'arrive_on_time' } });
      await api(`/api/visits/${enc(created.id)}/share`, { method: 'POST', body: { days: 7 } });
      await api(`/api/visits/${enc(created.id)}/business-dispatch`, { method: 'POST', body: { platform: 'Jobber' } });
      await refresh({ force: true });
      toast('Showcase 1: On-time arrival verified, Smart Lock PIN issued, and Jobber webhook fired!');
    } else if (type === 'dispute') {
      // 2. Late arrival + Bedrock AI Dispute audit
      const created = await api('/api/dev/demo-visit', { method: 'POST', body: { kind: 'ended', timeZone: tz } });
      state.selected = created.id;
      await api('/api/dev/simulate', { method: 'POST', body: { visitId: created.id, scenario: 'arrive_late' } });
      await api(`/api/visits/${enc(created.id)}/dispute`, {
        method: 'POST',
        body: { claim: "I arrived at 9:15 AM and rang twice, but the client didn't open the door." },
      });
      await refresh({ force: true });
      toast('Showcase 2: Bedrock AI evaluated late arrival claim against Ring ground-truth telemetry!');
    } else if (type === 'outage') {
      // 3. Camera outage fair protection
      const created = await api('/api/dev/demo-visit', { method: 'POST', body: { kind: 'ended', timeZone: tz } });
      state.selected = created.id;
      await api('/api/dev/simulate', { method: 'POST', body: { visitId: created.id, scenario: 'camera_offline' } });
      await refresh({ force: true });
      toast("Showcase 3: Ring camera outage detected. Verdict is fair \"Can't tell\" to protect contractor!");
    } else if (type === 'privacy') {
      // 4. Privacy gate test
      await api('/api/dev/simulate', {
        method: 'POST',
        body: {
          visitId: state.selected || state.visits[0]?.id || 'demo',
          scenario: 'passerby_outside_windows',
        },
      });
      await refresh({ force: true });
      toast('Showcase 4: Privacy Gate discarded outside motion with 0 bytes stored!');
    }
  } catch (err) {
    toast(`Showcase error: ${err.message}`);
  }
}

document.querySelectorAll('[data-judge]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    document.querySelectorAll('[data-judge]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    btn.classList.add('is-loading');
    try { await runJudgeScenario(btn.dataset.judge); } finally { btn.classList.remove('is-loading'); }
  });
});

/* ---------- actions ---------- */
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-action]');
  if (!t) return;
  const a = t.dataset.action;
  pendingBtn = t.classList.contains('btn') ? t : null;
  const v = selectedVisit();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  switch (a) {
    case 'new': return openNewVisit();
    case 'cancel-new': return $('#new-dialog').close();
    case 'open-dispute': return $('#dispute-dialog').showModal();
    case 'cancel-dispute': return $('#dispute-dialog').close();
    case 'fill-claim':
      $('#dispute-claim').value = t.dataset.claim;
      return;
    case 'toggle-payload': {
      const eid = t.dataset.evt;
      state.showPayload[eid] = !state.showPayload[eid];
      return renderSide();
    }
    case 'toggle-dispute-evidence':
      state.showDisputeEvidence = !state.showDisputeEvidence;
      return renderDetail();
    case 'check-integrity':
      return act(async () => {
        const res = await api(`/api/visits/${enc(v.id)}/verify-integrity`);
        state.integrityCheck = { visitId: v.id, ...res };
        renderDetail();
      }, 'Cryptographic integrity verified against raw Ring webhook HMAC signature.');
    case 'toggle-lock':
      return act(() => api(`/api/visits/${enc(v.id)}/smart-lock/toggle`, { method: 'POST' }), 'Smart lock access updated.');
    case 'dispatch-biz': {
      const sel = $('#biz-platform-select');
      const platform = sel ? sel.value : 'Jobber';
      return act(() => api(`/api/visits/${enc(v.id)}/business-dispatch`, { method: 'POST', body: { platform } }), `Dispatched webhook to ${platform}!`);
    }
    case 'select':
      state.selected = t.dataset.visit;
      state.snapshot = '';
      return refresh({ force: true });
    case 'exclude':
      return act(() => api(`/api/visits/${enc(v.id)}/signals/${enc(t.dataset.signal)}/exclude`, { method: 'POST', body: { excluded: true } }), 'Left out of the receipt.');
    case 'restore':
      return act(() => api(`/api/visits/${enc(v.id)}/signals/${enc(t.dataset.signal)}/exclude`, { method: 'POST', body: { excluded: false } }), 'Counted again.');
    case 'depart':
      return act(() => api(`/api/visits/${enc(v.id)}/confirm-departure`, { method: 'POST', body: {} }), 'Departure confirmed.');
    case 'summary':
      return act(() => api(`/api/visits/${enc(v.id)}/summary`, { method: 'POST', body: {} }), 'Summary written.');
    case 'share':
      return act(() => api(`/api/visits/${enc(v.id)}/share`, { method: 'POST', body: { days: 7 } }), 'Receipt link & QR code created.');
    case 'revoke':
      return act(() => api(`/api/visits/${enc(v.id)}/share`, { method: 'DELETE' }), 'Link revoked.');
    case 'copy': {
      const input = $('#share-url');
      input.select();
      (navigator.clipboard ? navigator.clipboard.writeText(input.value) : Promise.reject()).then(
        () => toast('Link copied.'),
        () => { document.execCommand('copy'); toast('Link copied.'); },
      );
      return;
    }
    case 'delete':
      if (!confirm('Delete this visit and every signal kept for it? This cannot be undone.')) return;
      return act(() => api(`/api/visits/${enc(v.id)}`, { method: 'DELETE' }), 'Visit deleted.');
    case 'demo-open':
    case 'demo-ended':
      return act(async () => {
        const created = await api('/api/dev/demo-visit', { method: 'POST', body: { kind: a === 'demo-open' ? 'open' : 'ended', timeZone: tz } });
        state.selected = created.id;
      }, 'Demo visit created.');
    case 'demo-story':
      return act(async () => {
        const created = await api('/api/dev/demo-visit', { method: 'POST', body: { kind: 'open', timeZone: tz } });
        state.selected = created.id;
        playDoorbellChime();
        await api('/api/dev/simulate', { method: 'POST', body: { visitId: created.id, scenario: 'arrive_on_time' } });
      }, 'Demo ready: doorbell pressed inside the window.');
    case 'demo-reset':
      if (!confirm('Delete every visit and reset the counters?')) return;
      return act(async () => {
        await api('/api/dev/reset', { method: 'POST', body: {} });
        state.selected = null;
      }, 'Demo data reset.');
    case 'sim':
      if (t.dataset.scenario === 'doorbell_now' || t.dataset.scenario === 'arrive_on_time') {
        playDoorbellChime();
      }
      return act(() => api('/api/dev/simulate', { method: 'POST', body: { visitId: v.id, scenario: t.dataset.scenario } }), 'Ring event sent.');
  }
});

/* ---------- boot ---------- */
async function boot() {
  state.config = await api('/api/config');
  $('#mode').textContent = state.config.simulatorEnabled
    ? 'Demo mode: Ring events come from the built-in simulator, sent through the same signed webhook as real ones.'
    : 'Receiving signed Ring webhooks at /webhooks/ring.';
  const d = await api('/api/devices');
  state.devices = d.devices;
  if (d.warning) toast(d.warning);
  await refresh({ force: true });
  setInterval(() => { if (!document.hidden) refresh().catch(() => {}); }, 2500);
}
boot().catch((e) => toast(e.message));
