# REI Hub tweaks

Chrome (MV3) content script for https://app.reihub.net.

1. **Sole-option Equity Account** — when a Book form / Add Transaction dialog shows an
   `Equity Account *` (or Distribution/Contribution Account) field that is empty and has
   exactly one option, it is picked automatically (e.g. `Owner Funds`).
2. **Unit defaults to "All Units"** — under Transaction Scope: Property/Unit, once a
   Property is chosen the blank `Unit *` field is set to `All Units`. Re-applies when the
   Property changes; if you clear Unit yourself it stays cleared.

## Install
chrome://extensions → Developer mode → Load unpacked → pick this folder.
Reload the REI Hub tab. Console shows `[reihub-tweaks] loaded`; each auto-fill logs a line.

## Tuning
Regexes at the top of `content.js` (`AUTO_SOLE_OPTION_LABEL_RE`, `UNIT_DEFAULT_RE`).
Set `window.__reihubTweaksDebug = true` in the console for verbose skips.
