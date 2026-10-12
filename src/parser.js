// Pure function: Document in, verdict out. No chrome.* APIs, so it runs in the
// offscreen document in production and under jsdom in tests.
//
// Amazon's markup is not a public contract. Everything Amazon-specific lives in
// this one file, and a page that matches nothing is reported as 'unknown'.

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

const SEL = {
  captcha: 'form[action*="validateCaptcha"], #captchacharacters',
  // AWS WAF interstitial (HTTP 202, solved by JS in a real tab). Seen live on .co.uk and .fr.
  botChallenge: '#challenge-container, script[src*="awswaf.com"]',
  // An email box the user can type in: only the signed-out page has one.
  emailField: 'input[name="email"]:not([type="hidden"]), #ap_email_login',
  // Password re-prompt shown to a signed-in user for the active account, also
  // when a second account is remembered (seen live on all five marketplaces):
  // no email box, the account sits in a hidden input.
  reauthClaim: 'input[type="hidden"][name="email"]',
  password: '#ap_password, input[type="password"]',
  reauthName: '.auth-prompt-profile-details .a-size-base-plus',
};

const text = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

/**
 * @returns {{status:'logged_in'|'logged_out'|'unknown', email?:string|null,
 *            claim?:string, name?:string|null, reason:string}}
 */
export function parseAccountPage(doc) {
  return (
    parseChallenge(doc) ??
    parseReauthPage(doc) ??
    parseSignInForm(doc) ?? { status: 'unknown', reason: 'unrecognized-page' }
  );
}

// Each parser returns a verdict, or null when the page is not its kind.

function parseChallenge(doc) {
  if (doc.querySelector(SEL.captcha)) return { status: 'unknown', reason: 'captcha' };
  if (doc.querySelector(SEL.botChallenge)) return { status: 'unknown', reason: 'bot-challenge' };
  return null;
}

function parseReauthPage(doc) {
  const claim = doc.querySelector(SEL.reauthClaim)?.getAttribute('value')?.trim();
  if (!claim || !doc.querySelector(SEL.password) || doc.querySelector(SEL.emailField)) return null;
  return {
    status: 'logged_in',
    email: claim.match(EMAIL_RE)?.[0] ?? null, // null => phone-number account
    claim,
    name: text(doc.querySelector(SEL.reauthName)) || null,
    reason: 'reauth-page',
  };
}

function parseSignInForm(doc) {
  if (!doc.querySelector(SEL.emailField)) return null;
  return { status: 'logged_out', reason: 'sign-in-form' };
}
