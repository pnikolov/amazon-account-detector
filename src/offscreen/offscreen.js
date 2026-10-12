import { parseAccountPage } from '../parser.js';

// DOMParser builds an inert document: scripts don't run, images don't load.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target !== 'offscreen' || msg.type !== 'parse') return;
  try {
    const doc = new DOMParser().parseFromString(msg.html, 'text/html');
    sendResponse({ ok: true, result: parseAccountPage(doc) });
  } catch (err) {
    sendResponse({ ok: false, error: String(err.message ?? err) });
  }
});
