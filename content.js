// REI Hub tweaks — content script.
// Targets MUI v4 Autocomplete fields (app.reihub.net). Two rules:
//   1. AUTO_SOLE_OPTION: for fields whose label matches, if the field is empty and the
//      dropdown has exactly one option, pick it. (Book → Distribution → "Owner Funds".)
//   2. UNIT_DEFAULT: when a "Unit" field is empty after a Property has been chosen,
//      pick the option matching UNIT_DEFAULT_RE ("All Units"). Re-applies whenever the
//      Property value changes; does NOT fight you if you clear the unit yourself.
(() => {
  'use strict';
  const TAG = '[reihub-tweaks]';
  const AUTO_SOLE_OPTION_LABEL_RE = /^(Equity Account|Distribution Account|Contribution Account)/i;
  const UNIT_LABEL_RE = /^Unit\b/i;
  const PROPERTY_LABEL_RE = /^Property\b/i;
  const UNIT_DEFAULT_RE = /^all units$/i;
  const DEBOUNCE_MS = 120;

  // state
  const soleTries = new WeakMap();          // autocomplete root -> attempts made (max 2)
  const unitKey = new WeakMap();            // unit root -> property value it was last defaulted for
  let busy = false, pending = false;

  const dbg = (...a) => { if (window.__reihubTweaksDebug) console.debug(TAG, ...a); };

  function labelFor(input) {
    if (!input.id) return '';
    const lbl = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
    return lbl ? lbl.textContent.trim() : '';
  }

  function autocompletes() {
    return [...document.querySelectorAll('.MuiAutocomplete-root')].map(root => {
      const input = root.querySelector('input.MuiAutocomplete-input');
      return input ? { root, input, label: labelFor(input) } : null;
    }).filter(Boolean);
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  async function waitForListbox(input, tries = 20) {
    for (let i = 0; i < tries; i++) {
      const lb = (input.id && document.getElementById(input.id + '-popup')) ||
                 document.querySelector('.MuiAutocomplete-popper ul[role="listbox"]');
      if (lb) return lb;
      await sleep(30);
    }
    return null;
  }

  // Open the popup, pick an option via predicate, close it, restore focus.
  // Returns the chosen option text, or null.
  async function pickOption(ac, predicate) {
    const { root, input } = ac;
    if (input.disabled) return null;
    const prevActive = document.activeElement;
    const btn = root.querySelector('button.MuiAutocomplete-popupIndicator');
    if (!btn) return null;
    btn.click();
    const lb = await waitForListbox(input);
    if (!lb) { dbg('no listbox for', ac.label); return null; }
    const opts = [...lb.querySelectorAll('li[role="option"]')];
    const target = predicate(opts);
    let chosen = null;
    if (target) {
      chosen = target.textContent.trim();
      target.click();              // MUI v4 option onClick -> selectNewValue
    } else {
      // close without selecting
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    }
    await sleep(0);
    if (prevActive && prevActive !== input && document.contains(prevActive) && prevActive.focus) {
      prevActive.focus();
    } else if (!target) {
      input.blur();
    }
    return chosen;
  }

  async function applySoleOption(acs) {
    for (const ac of acs) {
      if (!AUTO_SOLE_OPTION_LABEL_RE.test(ac.label)) continue;
      const tries = soleTries.get(ac.root) || 0;
      if (tries >= 2) continue;
      if (ac.input.value !== '') { soleTries.set(ac.root, 2); continue; }
      soleTries.set(ac.root, tries + 1);   // bump first so a failure can't loop
      const chosen = await pickOption(ac, opts => (opts.length === 1 ? opts[0] : null));
      if (chosen) { soleTries.set(ac.root, 2); console.info(TAG, `${ac.label} → "${chosen}" (sole option)`); }
      else dbg('sole-option: skipped', ac.label, 'attempt', tries + 1);
    }
  }

  function siblingProperty(unitAc, acs) {
    const scope = unitAc.root.closest('form, [role="dialog"]') || document;
    return acs.find(a => PROPERTY_LABEL_RE.test(a.label) && scope.contains(a.root)) || null;
  }

  async function applyUnitDefault(acs) {
    for (const ac of acs) {
      if (!UNIT_LABEL_RE.test(ac.label)) continue;
      const prop = siblingProperty(ac, acs);
      const key = prop ? prop.input.value : '';
      if (!key) continue;                       // no property chosen yet
      if (unitKey.get(ac.root) === key) continue; // already defaulted for this property
      if (ac.input.value !== '') { unitKey.set(ac.root, key); continue; } // app/rule filled it
      unitKey.set(ac.root, key);
      const chosen = await pickOption(ac, opts => opts.find(li => UNIT_DEFAULT_RE.test(li.textContent.trim())) || null);
      if (chosen) console.info(TAG, `Unit → "${chosen}" for property "${key}"`);
      else dbg('unit-default: no All Units option for', key);
    }
  }

  async function run() {
    if (busy) { pending = true; return; }
    busy = true;
    try {
      do {
        pending = false;
        const acs = autocompletes();
        await applySoleOption(acs);
        await applyUnitDefault(acs);
      } while (pending);
    } catch (e) {
      console.warn(TAG, e);
    } finally {
      busy = false; pending = false;
    }
  }

  let timer = null;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(run, DEBOUNCE_MS); };

  const mo = new MutationObserver(schedule);
  mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['value'] });
  // MUI updates input.value via React, not attributes; catch Property picks via input events too.
  document.addEventListener('input', schedule, true);
  document.addEventListener('change', schedule, true);
  document.addEventListener('click', schedule, true);
  schedule();
  console.info(TAG, 'loaded');
})();
