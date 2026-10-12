# Amazon Account Detector

Chrome MV3 extension that shows which Amazon account is signed in on a chosen
marketplace (US, UK, DE, IT, FR) without opening, focusing or reloading any tab.

## Install

1. Clone this repo. No build step is needed.
2. Open `chrome://extensions`, enable **Developer mode**.
3. **Load unpacked** and select the repo root (the folder with `manifest.json`).

## Try it

1. Click the toolbar icon and pick a marketplace.
2. The popup shows the cached result immediately, then re-checks if the cache is
   older than 60 seconds. **Refresh** forces a check.
3. Sign out of Amazon in a normal tab and reopen the popup: the result is flagged
   as doubtful within a couple of seconds and then flips to "Not signed in".

## Development

- `npm install && npm test` runs the parser and URL tests.
- `npm run format` formats JS, CSS and HTML with Prettier; `npm run format:check` verifies.
- After editing, click the reload icon on the extension card in `chrome://extensions`.

## Documentation

[DOCS.md](DOCS.md) covers how it works, the design decisions, what was verified
live and the known limitations.
