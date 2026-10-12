import { MARKETPLACES, DEFAULT_MARKETPLACE } from '../marketplaces.js';
import { getState, getSelected, setSelected, stateKey } from '../cache.js';

const POPUP_MAX_AGE_MS = 60_000; // younger than this: trust the cache, don't re-check
const STALE_AFTER_MS = 30 * 60_000; // older than this: visibly flag as stale

const $ = (id) => document.getElementById(id);
const select = $('marketplace');
let current = DEFAULT_MARKETPLACE;
let state = null;
let checking = false;

for (const m of MARKETPLACES) select.add(new Option(`${m.label} (${m.domain})`, m.id));

function ago(ts) {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

const isOld = (s) => Date.now() - s.checkedAt > STALE_AFTER_MS;
// A verdict we can no longer vouch for: old, cookies changed, or refresh failed.
const isDoubtful = (s) => isOld(s) || !!s.suspect || !!s.lastError;

function statusLabel(s, has) {
  if (!has) return checking ? 'Checking…' : 'Not checked yet';
  if (s.status === 'logged_in') return isDoubtful(s) ? 'Was signed in' : 'Signed in';
  return isDoubtful(s) ? 'Was signed out' : 'Not signed in';
}

function warningText(s, has) {
  if (!has) return s?.lastError ? `Check failed: ${s.lastError}` : null;
  if (s.lastError) return `Couldn't refresh (${s.lastError}). Showing last confirmed result.`;
  if (s.suspect) return 'Sign-in cookies changed since this check. Re-checking…';
  if (isOld(s)) return 'This result is old and may no longer be accurate.';
  return null;
}

function render() {
  const has = !!state?.checkedAt; // a verdict exists, not just a failed first attempt
  const card = $('card');
  card.dataset.status = has ? state.status : 'empty';
  card.dataset.dim = String(has && isDoubtful(state));

  $('status').textContent = statusLabel(state, has);

  // textContent only: values come from a remote page, never innerHTML them.
  const who = has && state.status === 'logged_in' ? (state.email ?? state.claim) : null;
  $('email').hidden = !who;
  $('email').textContent = who ?? '';
  $('name').hidden = !(who && state.name);
  $('name').textContent = state?.name ?? '';

  if (checking) $('freshness').textContent = 'Checking…';
  else $('freshness').textContent = has ? `Checked ${ago(state.checkedAt)}` : '';
  $('refresh').disabled = checking;

  const warn = warningText(state, has);
  $('warning').hidden = !warn;
  $('warning').textContent = warn ?? '';
}

// Asks the background to check. The result is not read from the reply: every
// state change, from any trigger, arrives through storage.onChanged below.
async function requestCheck(maxAgeMs) {
  const id = current;
  checking = true;
  render();
  try {
    await chrome.runtime.sendMessage({ type: 'check', id, maxAgeMs });
  } finally {
    // user may have switched marketplace meanwhile
    if (id === current) {
      checking = false;
      render();
    }
  }
}

async function show(id) {
  current = id;
  select.value = id;
  state = await getState(id); // 1) paint cache instantly
  render();
  requestCheck(POPUP_MAX_AGE_MS); // 2) revalidate if not fresh
}

select.addEventListener('change', () => {
  setSelected(select.value);
  show(select.value);
});
$('refresh').addEventListener('click', () => requestCheck(0));

// Every background write lands here: popup, alarm and cookie-triggered checks.
chrome.storage.onChanged.addListener((changes, area) => {
  const change = area === 'local' && changes[stateKey(current)];
  if (change) {
    state = change.newValue ?? null;
    render();
  }
});

setInterval(render, 5_000); // keep "Checked 12s ago" ticking
show(await getSelected());
