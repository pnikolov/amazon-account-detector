// Single source of truth for supported marketplaces.
// Adding one = one entry here + one host_permissions line in manifest.json.
export const MARKETPLACES = [
  { id: 'us', label: 'United States', domain: 'amazon.com', assocHandle: 'usflex' },
  { id: 'uk', label: 'United Kingdom', domain: 'amazon.co.uk', assocHandle: 'gbflex' },
  { id: 'de', label: 'Germany', domain: 'amazon.de', assocHandle: 'deflex' },
  { id: 'it', label: 'Italy', domain: 'amazon.it', assocHandle: 'itflex' },
  { id: 'fr', label: 'France', domain: 'amazon.fr', assocHandle: 'frflex' },
];

export const DEFAULT_MARKETPLACE = 'us';

export const getMarketplace = (id) => MARKETPLACES.find((m) => m.id === id);

/** Account-switcher / sign-in URL for a marketplace. */
export function signinUrl({ domain, assocHandle }) {
  const origin = `https://www.${domain}`;
  const params = new URLSearchParams({
    'openid.pape.max_auth_age': '0',
    'openid.return_to': `${origin}/?&ref_=nav_youraccount_switchacct`,
    'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
    'openid.assoc_handle': assocHandle,
    'openid.mode': 'checkid_setup',
    'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    ignoreAuthState: '1',
    _encoding: 'UTF8',
  });
  return `${origin}/ap/signin?${params}`;
}

/** Map a cookie domain (".amazon.co.uk") to a marketplace, exact-suffix safe. */
export function marketplaceForCookieDomain(cookieDomain) {
  const host = cookieDomain.replace(/^\./, '').toLowerCase();
  return MARKETPLACES.find((m) => host === m.domain || host.endsWith(`.${m.domain}`));
}

// Amazon's auth cookies: at-main / sess-at-main / x-main on .com,
// at-acbuk / x-acbde / ... on the EU marketplaces.
export const AUTH_COOKIE_RE = /^(sess-)?at-(main|acb[a-z]{2})$|^x-(main|acb[a-z]{2})$/;
