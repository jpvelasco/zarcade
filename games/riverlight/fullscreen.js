// Full screen for Starlight Arcade games, with the player always in control.
//
// The page-level Fullscreen API hides the browser's toolbar for real: moving
// the mouse to the top of the screen no longer drops the address bar down.
// The browser always keeps Esc as a way out, and this adds a pill at the top
// centre that slides in when the pointer nears the top edge:
// "Full screen" normally, "Exit full screen (Esc)" while in full screen.
//
// Browsers end full screen whenever the page changes, and only allow entering
// it from a click or key press. So once the player turns it on, their next
// click or key press on any arcade page enters it again, until they turn it
// off with the pill or Esc. Leaving a page never turns the preference off.
//
// On desktop the arcade opens games in a full-window frame (see
// arcade/arcade.js), so full screen belongs to the arcade page and survives
// switching games. A framed game drives the arcade's full screen, and its
// links back to the arcade close the frame instead of loading the arcade
// inside it.
//
// The canonical copy lives in arcade/fullscreen.js; every game keeps an
// identical copy (`npm run sync-telemetry` refreshes the shared files).
(function (root) {
  'use strict';

  const PREF_KEY = 'arcade.v1.fullscreen';
  const REVEAL_PX = 72; // how close to the top edge the pointer must come
  const HIDE_MS = 1600;
  const FRAME_NAME = 'zarcade-game'; // the arcade names its game frame this
  const BACK_MESSAGE = 'zarcade:arcade'; // a framed game asking to go back

  // The preference logic, separate from the DOM so tests can drive it.
  // `wanted` is the player's choice; `active` is whether the page is in full
  // screen right now.
  function createState(storage) {
    const read = () => {
      try {
        return storage ? storage.getItem(PREF_KEY) === 'on' : false;
      } catch (_) {
        return false;
      }
    };
    const write = (on) => {
      try {
        if (!storage) return;
        if (on) storage.setItem(PREF_KEY, 'on');
        else storage.removeItem(PREF_KEY);
      } catch (_) {
        // Storage blocked: the choice lasts for this page only.
      }
    };
    const state = {
      wanted: read(),
      active: false,
      leaving: false, // the page is unloading; full screen ending is not a choice
      requested: false, // our own request is in flight
    };
    return {
      get wanted() { return state.wanted; },
      get active() { return state.active; },
      // The player pressed the pill.
      toggle() {
        state.wanted = !state.active;
        write(state.wanted);
        return state.wanted ? 'enter' : 'exit';
      },
      // A click or key press happened: re-enter if the player wants it.
      gesture(key) {
        if (key === 'Escape' || key === 'F11') return 'none';
        return state.wanted && !state.active && !state.requested ? 'enter' : 'none';
      },
      requested(value) {
        state.requested = value;
      },
      // The browser reports full screen changed.
      changed(active) {
        state.requested = false;
        const was = state.active;
        state.active = active;
        // Leaving full screen while staying on the page means the player chose
        // to leave (Esc, the pill, or the browser's own controls).
        if (was && !active && !state.leaving) {
          state.wanted = false;
          write(false);
        }
        if (active) {
          state.wanted = true;
          write(true);
        }
      },
      // A request was refused (no user activation, or a policy said no).
      failed() {
        state.requested = false;
      },
      leave() {
        state.leaving = true;
      },
    };
  }

  // The arcade window hosting this page in its game frame, or null when the
  // page runs on its own (or someone else frames it).
  function framedBy(win) {
    if (win.name !== FRAME_NAME || win.parent === win) return null;
    try {
      return win.parent.document ? win.parent : null;
    } catch (_) {
      return null; // cross-origin parent
    }
  }

  // Does this link lead to the arcade page itself (any query or hash)?
  function isArcadeUrl(href, arcadeHref) {
    try {
      const page = (u) => `${u.origin}${u.pathname.replace(/index\.html$/, '')}`;
      return page(new URL(href)) === page(new URL(arcadeHref));
    } catch (_) {
      return false;
    }
  }

  // ------------------------------------------------------------ browser side

  // `signal` removes the listeners again: a framed game listens on the
  // arcade's document, which outlives the frame.
  function api(doc, signal) {
    const el = doc.documentElement;
    const on = signal ? { signal } : false;
    return {
      supported: !!(doc.fullscreenEnabled || doc.webkitFullscreenEnabled) && !!(el.requestFullscreen || el.webkitRequestFullscreen),
      element: () => doc.fullscreenElement || doc.webkitFullscreenElement || null,
      enter: () => (el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : el.webkitRequestFullscreen()),
      exit: () => (doc.exitFullscreen ? doc.exitFullscreen() : doc.webkitExitFullscreen()),
      onChange: (fn) => {
        doc.addEventListener('fullscreenchange', fn, on);
        doc.addEventListener('webkitfullscreenchange', fn, on);
      },
      onError: (fn) => {
        doc.addEventListener('fullscreenerror', fn, on);
        doc.addEventListener('webkitfullscreenerror', fn, on);
      },
    };
  }

  const PILL_CSS = `
    :host { all: initial; }
    button {
      position: fixed; left: 50%; top: max(8px, env(safe-area-inset-top)); z-index: 2147482000;
      display: inline-flex; align-items: center; gap: 8px;
      padding: 9px 16px; border: 1px solid rgba(255,255,255,.28); border-radius: 999px;
      background: rgba(10, 6, 28, .82); color: #fff4e6;
      font: 700 14px/1 "Avenir Next", "Segoe UI", system-ui, sans-serif; letter-spacing: .02em;
      box-shadow: 0 6px 20px rgba(0,0,0,.45); backdrop-filter: blur(8px);
      cursor: pointer; transform: translate(-50%, -150%); opacity: 0;
      transition: transform .22s ease, opacity .22s ease;
    }
    button.show { transform: translate(-50%, 0); opacity: 1; }
    button:hover { border-color: #5ef2ff; }
    button:focus-visible { outline: 3px solid #ffd35c; outline-offset: 3px; transform: translate(-50%, 0); opacity: 1; }
    svg { width: 16px; height: 16px; }
    @media (prefers-reduced-motion: reduce) { button { transition: none; } }`;
  const ICON_ENTER = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4"/></svg>';
  const ICON_EXIT = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 2v4H2M14 6h-4V2M10 14v-4h4M2 10h4v4"/></svg>';

  function boot(win) {
    const doc = win.document;
    const arcade = framedBy(win);
    // In the arcade's frame, full screen is the arcade page's.
    const stop = arcade && new win.AbortController();
    const fs = api(arcade ? arcade.document : doc, stop && stop.signal);
    if (!fs.supported) return { supported: false };
    let storage = null;
    try {
      storage = win.localStorage;
    } catch (_) {
      storage = null;
    }
    const state = createState(storage);
    const log = win.Telemetry && win.Telemetry.log;

    const host = doc.createElement('div');
    host.id = 'arcade-fullscreen';
    const shadow = host.attachShadow({ mode: 'open' });
    const style = doc.createElement('style');
    style.textContent = PILL_CSS;
    const pill = doc.createElement('button');
    pill.type = 'button';
    shadow.append(style, pill);

    let hideTimer = 0;
    let pinned = false; // keep the pill out while the pointer is on it
    function label() {
      const on = !!fs.element();
      pill.innerHTML = on ? `${ICON_EXIT}<span>Exit full screen (Esc)</span>` : `${ICON_ENTER}<span>Full screen</span>`;
      pill.setAttribute('aria-label', on ? 'Exit full screen' : 'Enter full screen');
    }
    function show(ms = HIDE_MS) {
      pill.classList.add('show');
      win.clearTimeout(hideTimer);
      hideTimer = win.setTimeout(() => {
        if (!pinned) pill.classList.remove('show');
      }, ms);
    }

    function enter(source) {
      state.requested(true);
      try {
        const result = fs.enter();
        if (result && typeof result.catch === 'function') {
          result.catch((error) => {
            state.failed();
            if (log) log.warn('fullscreen.refused', { source, reason: String(error && error.message || error) });
          });
        }
      } catch (error) {
        state.failed();
        if (log) log.warn('fullscreen.refused', { source, reason: String(error && error.message || error) });
      }
    }

    pill.addEventListener('click', (event) => {
      event.stopPropagation();
      if (state.toggle() === 'enter') enter('button');
      else if (fs.element()) fs.exit()?.catch?.(() => {});
    });
    pill.addEventListener('pointerenter', () => { pinned = true; show(); });
    pill.addEventListener('pointerleave', () => { pinned = false; show(600); });
    // Keep the pill's own clicks and keys from reaching the game.
    for (const type of ['pointerdown', 'mousedown', 'keydown']) pill.addEventListener(type, (e) => e.stopPropagation());

    // Reveal the pill when the pointer comes near the top edge.
    win.addEventListener('pointermove', (event) => {
      if (event.clientY <= REVEAL_PX) show();
    }, { passive: true });
    // On touch screens, a tap near the top shows it.
    win.addEventListener('pointerdown', (event) => {
      if (event.pointerType !== 'mouse' && event.clientY <= REVEAL_PX) show(3000);
    }, { passive: true, capture: true });

    // Re-enter on the player's next click or key press, if they want it.
    const onGesture = (event) => {
      if (event.composedPath && event.composedPath().includes(host)) return; // the pill handles itself
      if (state.gesture(event.key) === 'enter') enter(event.type);
    };
    win.addEventListener('pointerup', onGesture, true);
    win.addEventListener('keydown', onGesture, true);

    fs.onChange(() => {
      const active = !!fs.element();
      state.changed(active);
      label();
      show(active ? 2200 : HIDE_MS);
      if (log) log.event(active ? 'fullscreen.enter' : 'fullscreen.exit', { wanted: state.wanted });
    });
    fs.onError(() => state.failed());
    win.addEventListener('pagehide', () => state.leave());
    win.addEventListener('beforeunload', () => state.leave());
    // Links that leave the page (Back to arcade, a cabinet) are not a choice
    // to leave full screen either.
    doc.addEventListener('click', (event) => {
      const link = event.target && event.target.closest && event.target.closest('a[href]');
      if (link && !link.target && !event.defaultPrevented) state.leave();
    });

    if (arcade) {
      win.addEventListener('pagehide', () => stop.abort());
      doc.addEventListener('click', (event) => {
        const link = event.target && event.target.closest && event.target.closest('a[href]');
        if (!link || event.button || event.ctrlKey || event.metaKey || event.shiftKey) return;
        if (!isArcadeUrl(link.href, arcade.location.href)) return;
        event.preventDefault();
        arcade.postMessage({ type: BACK_MESSAGE }, win.location.origin);
      }, true);
    }

    if (fs.element()) state.changed(true); // a framed game opening in full screen
    label();
    const mount = () => doc.body.append(host);
    if (doc.body) mount();
    else doc.addEventListener('DOMContentLoaded', mount);
    return { supported: true, state, pill };
  }

  const Fullscreen = { PREF_KEY, REVEAL_PX, FRAME_NAME, BACK_MESSAGE, createState, framedBy, isArcadeUrl };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Fullscreen;
  } else {
    root.ArcadeFullscreen = Object.assign(Fullscreen, boot(root));
  }
})(typeof window !== 'undefined' ? window : globalThis);
