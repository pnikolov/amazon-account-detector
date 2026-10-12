// Tests marked "live:" use fixtures trimmed from real Amazon responses; the
// rest are hand-written and only pin the parser's decision logic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { parseAccountPage } from '../src/parser.js';
import {
  MARKETPLACES,
  signinUrl,
  marketplaceForCookieDomain,
  AUTH_COOKIE_RE,
} from '../src/marketplaces.js';

const parse = (html) => parseAccountPage(new JSDOM(html).window.document);

test('sign-in form => logged_out', () => {
  assert.equal(
    parse('<form name="signIn"><input id="ap_email" name="email"></form>').status,
    'logged_out',
  );
});

test('captcha and unknown pages => unknown (never a false logged_out)', () => {
  assert.equal(parse('<form action="/errors/validateCaptcha"></form>').status, 'unknown');
  assert.equal(parse('<h1>Sorry, something went wrong</h1>').status, 'unknown');
});

// Trimmed from live responses (signed out, no cookies), 2026-10-11.
test('live: AWS WAF challenge page => unknown, bot-challenge', () => {
  const r =
    parse(`<head><script src="https://1c5c1ecf7303.7a63328c.eu-central-1.token.awswaf.com/1c5c1ecf7303/2d9e2c31d174/d26d5ce40abb/challenge.js"></script></head>
    <body><div id="challenge-container"></div></body>`);
  assert.deepEqual([r.status, r.reason], ['unknown', 'bot-challenge']);
});

// Trimmed from a live capture (amazon.com, two remembered accounts), 2026-10-11.
// Name and email replaced; the capture is the same page on all five marketplaces.
test('live: password re-prompt for the active account => logged_in', () => {
  const r = parse(`<div id="authportal-main-section" class="a-section">
    <a id="ap_switch_account_link" class="a-link-normal" href="https://www.amazon.com/ap/signin">Switch accounts</a>
    <div class="a-section auth-prompt-section"><div class="a-fixed-right-grid-col auth-prompt-profile-details a-col-right">
      <div class="a-row a-size-base-plus auth-text-truncate">Ana Example</div>
      <div class="a-row a-size-base auth-text-truncate auth-prompt-profile-business-name"></div>
      <div class="a-row a-size-base a-color-tertiary auth-text-truncate">ana@example.com</div></div>
      <input type="hidden" name="email" value="ana@example.com" id="ap-claim"></div>
    <form name="signIn" method="post" novalidate action="https://www.amazon.com/ap/signin">
      <input type="hidden" name="email" value="ana@example.com" id="ap-claim">
      <input type="password" maxlength="1024" id="ap_password" autocomplete="current-password" name="password"></form>
    <form name="signIn" method="post" action="https://www.amazon.com/ap/signin">
      <input type="hidden" name="email" value="ana@example.com" id="ap_email"></form></div>`);
  assert.deepEqual(
    [r.status, r.email, r.name, r.reason],
    ['logged_in', 'ana@example.com', 'Ana Example', 'reauth-page'],
  );
});

test('phone-number account: logged in, no email', () => {
  const r = parse(`<form name="signIn"><input type="hidden" name="email" value="+359881234567"/>
    <input type="password" id="ap_password"/></form>`);
  assert.deepEqual([r.status, r.email, r.claim], ['logged_in', null, '+359881234567']);
});

test('password box next to a visible email box is still logged_out', () => {
  const r = parse(`<form name="signIn"><input type="hidden" name="email" value=""/>
    <input type="email" id="ap_email" name="email"/><input type="password" id="ap_password"/></form>`);
  assert.equal(r.status, 'logged_out');
});

test('live: signed-out /ax/claim page => logged_out', () => {
  const r =
    parse(`<form id="ap_login_form" name="signIn" method="post" novalidate action="/ax/claim?openid.assoc_handle=deflex&amp;openid.mode=checkid_setup">
    <input type="hidden" name="claimCollectionWorkflow" value="unified"/>
    <input type="text" id="ap_email_login" autocomplete="username" name="email" class="a-input-text"/></form>`);
  assert.deepEqual([r.status, r.reason], ['logged_out', 'sign-in-form']);
});

test('signin URL has the expected OpenID parameters', () => {
  const url = signinUrl(MARKETPLACES[1]);
  assert.ok(url.startsWith('https://www.amazon.co.uk/ap/signin?openid.pape.max_auth_age=0'));
  assert.ok(url.includes('openid.assoc_handle=gbflex'));
  assert.ok(
    url.includes(
      'openid.return_to=https%3A%2F%2Fwww.amazon.co.uk%2F%3F%26ref_%3Dnav_youraccount_switchacct',
    ),
  );
});

test('cookie mapping', () => {
  assert.equal(marketplaceForCookieDomain('.amazon.co.uk').id, 'uk');
  assert.equal(marketplaceForCookieDomain('.amazon.com').id, 'us');
  assert.equal(marketplaceForCookieDomain('.amazon.com.au'), undefined);
  assert.equal(marketplaceForCookieDomain('notamazon.com'), undefined);
  for (const n of ['at-main', 'sess-at-main', 'x-main', 'at-acbuk', 'x-acbde'])
    assert.ok(AUTH_COOKIE_RE.test(n), n);
  for (const n of ['session-id', 'ubid-main', 'i18n-prefs']) assert.ok(!AUTH_COOKIE_RE.test(n), n);
});
