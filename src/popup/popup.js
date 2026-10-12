import { MARKETPLACES } from '../marketplaces.js';
import { getState, getSelected, setSelected, stateKey } from '../cache.js';

const POPUP_MAX_AGE_MS = 60_000; // younger than this: trust the cache, don't re-check
const STALE_AFTER_MS = 30 * 60_000; // older than this: visibly flag as stale

const $ = (id) => document.getElementById(id);
const select = $('marketplace'); // its value is the marketplace on show
let state = null; // cache entry for that marketplace
let isLoading = false;

function render() {
  // The entry holds a verdict only once a check has succeeded; a failed first
  // check leaves just lastError.
  const verdict = state?.checkedAt ? state : null;
  const old = !!verdict && Date.now() - verdict.checkedAt > STALE_AFTER_MS;

  // A verdict we can no longer guarantee: old, cookies changed, or refresh failed.
  const doubtful = old || !!verdict?.suspect || !!verdict?.lastError;
  const signedIn = verdict?.status === 'logged_in';

  $('card').dataset.status = verdict?.status ?? 'empty';
  $('card').dataset.dim = String(doubtful);
  $('status').textContent = statusLabel(verdict, doubtful, state?.lastError);

  setText('email', signedIn ? (verdict.email ?? verdict.claim) : null);
  setText('name', signedIn ? verdict.name : null);
  setText('warning', warningText(verdict, old, state?.lastError));

  let freshness = '';

  if (isLoading) freshness = 'Checking…';
  else if (verdict) freshness = `Checked ${ago(verdict.checkedAt)}`;

  $('freshness').textContent = freshness;
  $('refresh').disabled = isLoading;
}

function statusLabel(verdict, doubtful, lastError) {
  if (!verdict && isLoading) return 'Checking…';
  if (!verdict) return lastError ? 'Unknown' : 'Not checked yet';
  if (verdict.status === 'logged_in') return doubtful ? 'Was signed in' : 'Signed in';

  return doubtful ? 'Was signed out' : 'Not signed in';
}

function warningText(verdict, old, lastError) {
  if (!verdict) return lastError ? `Check failed: ${lastError}` : null;
  if (lastError) return `Couldn't refresh (${lastError}). Showing last confirmed result.`;
  if (verdict.suspect) return 'Sign-in cookies changed since this check. Re-checking…';
  if (old) return 'This result is old and may no longer be accurate.';

  return null;
}

/** Sets an element's text, hiding the element when there is none. */
function setText(id, value) {
  $(id).textContent = value ?? '';
  $(id).hidden = !value;
}

function ago(ts) {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s} s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;

  return `${Math.floor(s / 86400)} d ago`;
}

async function show() {
  state = await getState(select.value); // paint cache instantly

  render();

  requestCheck(POPUP_MAX_AGE_MS); // revalidate if not fresh
}

/** Requests a check from the background script. */
async function requestCheck(maxAgeMs) {
  const id = select.value;
  isLoading = true;

  render();

  let error = null;

  try {
    await chrome.runtime.sendMessage({ type: 'check', id, maxAgeMs });
  } catch {
    error = 'The extension did not respond';
  }

  // user may have switched marketplace meanwhile
  if (id !== select.value) return;

  isLoading = false;
  // Not written to the cache: shown until the next result arrives.
  if (error) state = { ...state, lastError: error };

  render();
}

select.addEventListener('change', () => {
  setSelected(select.value);
  show();
});

$('refresh').addEventListener('click', () => requestCheck(0));

// Every background write lands here: popup, alarm and cookie-triggered checks.
chrome.storage.onChanged.addListener((changes, area) => {
  const change = area === 'local' && changes[stateKey(select.value)];

  if (change) {
    state = change.newValue ?? null;
    render();
  }
});

for (const m of MARKETPLACES) {
  select.add(new Option(`${m.label} (${m.domain})`, m.id));
}

select.value = await getSelected();
show();

setInterval(render, 5_000); // keep "Checked 12 s ago" ticking
