import {
  MARKETPLACES,
  AUTH_COOKIE_RE,
  getMarketplace,
  signinUrl,
  marketplaceForCookieDomain,
} from './marketplaces.js';
import { getState, patchState, getSelected } from './cache.js';

const REFRESH_ALARM = 'refresh';
const REFRESH_MINUTES = 15;
const FETCH_TIMEOUT_MS = 15_000;
const COOKIE_DEBOUNCE_MS = 1_500;
const COOKIE_QUIET_MS = 5_000; // ignore cookie churn caused by our own fetch

// ---------- the check itself ----------

const inflight = new Map(); // id -> Promise (dedupes popup + alarm + cookie triggers)
const lastCheckEnd = new Map();

/** Re-checks unless the cached verdict is younger than maxAgeMs. Results go to the cache. */
export async function check(id, { maxAgeMs = 0 } = {}) {
  const mp = getMarketplace(id);
  if (!mp) throw new Error(`Unknown marketplace: ${id}`);

  const cached = await getState(id);
  const fresh = cached?.checkedAt && !cached.suspect && Date.now() - cached.checkedAt < maxAgeMs;
  if (fresh) return;

  if (!inflight.has(id)) {
    inflight.set(
      id,
      runCheck(mp).finally(() => {
        inflight.delete(id);
        lastCheckEnd.set(id, Date.now());
      }),
    );
  }
  await inflight.get(id);
}

async function runCheck(mp) {
  try {
    const html = await fetchSigninPage(mp);
    const result = await parseInOffscreen(html);
    if (result.status === 'unknown')
      throw new Error(`Could not read Amazon's page (${result.reason})`);

    // A definitive answer overwrites every verdict field; the nulls clear what
    // the previous verdict had (e.g. the email after a sign-out).
    await patchState(mp.id, {
      status: result.status,
      email: result.email ?? null,
      claim: result.claim ?? null,
      name: result.name ?? null,
      checkedAt: Date.now(),
      suspect: false,
      lastError: null,
    });
  } catch (err) {
    // No definitive answer: keep last-known verdict, but record that the
    // refresh failed so the popup can say so instead of looking fresh.
    await patchState(mp.id, {
      lastError: err.name === 'AbortError' ? 'Timed out' : String(err.message ?? err),
    });
  }
}

async function fetchSigninPage(mp) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    // host_permissions make this a credentialed request with the user's Amazon
    // cookies - same thing a tab would send, but no tab, no navigation.
    const res = await fetch(signinUrl(mp), {
      credentials: 'include',
      cache: 'no-store',
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`Amazon responded ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// ---------- offscreen document (service workers have no DOMParser) ----------

const OFFSCREEN_URL = 'src/offscreen/offscreen.html';
let creating = null;
let pendingParses = 0;

async function ensureOffscreen() {
  const existing = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (existing.length) return;
  creating ??= chrome.offscreen
    .createDocument({
      url: OFFSCREEN_URL,
      reasons: ['DOM_PARSER'],
      justification: 'Parse the Amazon sign-in page HTML to read the signed-in account.',
    })
    .finally(() => {
      creating = null;
    });
  await creating;
}

async function parseInOffscreen(html) {
  pendingParses++;
  try {
    await ensureOffscreen();
    const res = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'parse', html });
    if (!res?.ok) throw new Error(res?.error ?? 'Parser unavailable');
    return res.result;
  } finally {
    if (--pendingParses === 0) chrome.offscreen.closeDocument().catch(() => {});
  }
}

// ---------- triggers ----------

// 1) Popup asks (on open / marketplace change / manual refresh).
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target === 'offscreen' || msg?.type !== 'check') return; // not ours
  // The reply only signals "done"; the popup reads the result from the cache.
  check(msg.id, { maxAgeMs: msg.maxAgeMs ?? 0 })
    .catch(console.warn)
    .finally(() => sendResponse());
  return true; // async response
});

// 2) Background heartbeat: re-check the selected marketplace plus any we
//    currently believe is logged in (the only ones that can silently go wrong).
async function ensureAlarm() {
  if (!(await chrome.alarms.get(REFRESH_ALARM))) {
    chrome.alarms.create(REFRESH_ALARM, { periodInMinutes: REFRESH_MINUTES });
  }
}
chrome.runtime.onInstalled.addListener(ensureAlarm);
chrome.runtime.onStartup.addListener(ensureAlarm);

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== REFRESH_ALARM) return;
  const selected = await getSelected();
  for (const mp of MARKETPLACES) {
    const state = await getState(mp.id);
    if (mp.id === selected || state?.status === 'logged_in') await check(mp.id); // sequential: be gentle
  }
});

// 3) Auth cookie changed (logout, login, account switch, expiry): once the
//    burst of changes settles, flag the cache as suspect and confirm with a
//    real check.
const cookieTimers = new Map();
chrome.cookies.onChanged.addListener(({ cookie }) => {
  if (!AUTH_COOKIE_RE.test(cookie.name)) return;
  const mp = marketplaceForCookieDomain(cookie.domain);
  if (!mp) return;
  // Amazon may rewrite auth cookies in response to our own fetch; reacting to
  // those would make every check trigger another one.
  if (inflight.has(mp.id) || Date.now() - (lastCheckEnd.get(mp.id) ?? 0) < COOKIE_QUIET_MS) return;

  clearTimeout(cookieTimers.get(mp.id));
  cookieTimers.set(
    mp.id,
    setTimeout(async () => {
      cookieTimers.delete(mp.id);
      if (await getState(mp.id)) await patchState(mp.id, { suspect: true });
      await check(mp.id);
    }, COOKIE_DEBOUNCE_MS),
  );
});
