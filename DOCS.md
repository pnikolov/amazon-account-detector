# Amazon Account Detector: technical documentation

How the extension works and why it is built this way. For install and usage,
see [README.md](README.md).

## How it works

```
popup ──"check"──▶ service worker ──fetch(credentials: include)──▶ amazon /ap/signin
  ▲                     │  ▲                                        (sign-in page)
  │                     │  └── HTML ──▶ offscreen document (DOMParser) ──▶ verdict
  └── storage.onChanged ◀── chrome.storage.local  (one key per marketplace)
```

| File | Role |
|------|------|
| `src/marketplaces.js` | Marketplace table, sign-in URL builder, auth-cookie matching |
| `src/background.js` | Runs checks, owns the cache, reacts to alarm / cookie / popup triggers |
| `src/parser.js` | Pure `Document -> verdict` function; all Amazon-specific selectors |
| `src/offscreen/` | Hosts `DOMParser`, which service workers do not have |
| `src/popup/` | Renders cached state, freshness and warnings |

## Design decisions

**Detection: background `fetch`, no tab.** With `host_permissions` the service
worker can request Amazon's sign-in page with the user's cookies. Nothing
visible happens: no tab, no window, no focus change, no content script injected
into pages the user is reading. Alternatives considered:

- *Hidden or pinned background tab*: works but is visible in the tab strip and
  can steal focus; not implemented.
- *Content script reading the nav bar*: only works when an Amazon tab is open,
  and the nav shows a first name, not the email.
- *Cookies alone*: tell you a session probably exists, not whose it is.

**Parsing: offscreen document.** The HTML is parsed with `DOMParser` (inert:
no scripts run, no subresources load) instead of regex. The offscreen document
is created on demand and closed after the parse.

**Caching: stale-while-revalidate.** State is stored per marketplace in
`chrome.storage.local` as
`{status, email, claim, name, checkedAt, suspect, lastError}`.
The popup paints the cache first and revalidates behind it.

**Three refresh triggers.**

| Trigger | When | Why |
|---------|------|-----|
| Popup open / marketplace change | cache older than 60 s | the user is looking right now |
| `chrome.alarms`, every 15 min | selected marketplace + any cached as signed in | catches server-side session expiry |
| `chrome.cookies.onChanged` on auth cookies | immediately, debounced 1.5 s | catches logout, login and account switch |

**Not misleading the user.** A failed or inconclusive check (network error,
captcha, unrecognised page) never overwrites the verdict; it sets `lastError`
and the popup says "Was signed in ... couldn't refresh". An auth-cookie change
sets `suspect` so the cached email is dimmed until re-confirmed. Results older
than 30 minutes are labelled as old. "Unknown" is never reported as "signed out".

**No build step, no framework.** Three small UI states do not justify React or
a bundler; ES modules load natively in MV3, and anyone can load the repo as is.

## Verified

Checked live on all five marketplaces, with one and with two remembered
accounts: Amazon answers the background request with a password re-prompt for
the active account, and the parser reads the name and email from there.

## Known limitations

- Detection depends on the markup of Amazon's sign-in page, which is not a
  public contract. If it changes, checks become inconclusive ("couldn't
  refresh") until the selectors in `src/parser.js` are updated.
- Amazon may serve a captcha or an AWS WAF challenge page (HTTP 202, observed
  on `.co.uk` and `.fr` for cookieless requests) to background requests; this
  surfaces as "couldn't refresh", and the 15-minute cadence is deliberately gentle.
- An account registered with a phone number has no email to show; the popup
  shows the phone number instead.
- The email is stored unencrypted in `chrome.storage.local` on this device only.
