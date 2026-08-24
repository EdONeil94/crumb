// ─── APP LIFECYCLE ───────────────────────────────────────────────────────────
// PWA install, update check, mobile status bar fix, pull-to-refresh, and
// keyboard-aware scrolling (pages/components carving, Phase 1 step 7 — see
// CLAUDE.md). All 5 blocks are self-executing side effects with no shared
// state beyond their own private module scope — genuinely order-independent
// relative to the rest of the app's init (each only touches static DOM
// elements already present at module-script execution time, or sets up
// listeners/timers with no dependency on anything else having run first),
// so moving them earlier in the overall load sequence (this file's import
// is hoisted ahead of legacy-app.js's own top-level code, per ES module
// evaluation order) has no observable behavioral difference.

import { registerActions } from '../events/actions.js';
import { showToast } from '../utils/dom.js';

// ─── KEYBOARD-AWARE SCROLLING (mobile) ────────────────────────────────────────
(function() {
  // When any text input, textarea, or select inside a modal gains focus,
  // scroll it (and anything just below it, like autocomplete results) into
  // view above the on-screen keyboard, once the keyboard has finished animating in.
  function scrollFocusedIntoView(el) {
    if (!el) return;
    setTimeout(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 320); // give the keyboard time to finish sliding up
  }

  document.addEventListener('focusin', e => {
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      const modal = e.target.closest('.modal-overlay.open, .modal');
      if (modal) scrollFocusedIntoView(e.target);
    }
  });

  // Re-scroll when new content (like search results) appears below a focused input,
  // since that content can otherwise render hidden behind the keyboard.
  const resultContainerIds = [
    'bakeryResultsKnown', 'bakeryResultsGoogle', 'itemMatchResults',
    'shareUserRows', 'catalogueList'
  ];
  const observer = new MutationObserver(muts => {
    const active = document.activeElement;
    if (!active || (active.tagName !== 'INPUT' && active.tagName !== 'TEXTAREA')) return;
    for (const m of muts) {
      if (resultContainerIds.includes(m.target.id) && m.target.innerHTML.trim()) {
        // Scroll the results themselves into view — they're what ends up hidden behind the keyboard
        scrollFocusedIntoView(m.target);
        break;
      }
    }
  });
  resultContainerIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) observer.observe(el, { childList: true });
  });

  // Keep modals correctly sized when the on-screen keyboard changes the visible viewport
  // (mainly benefits Android Chrome; iOS Safari handles this natively for the most part).
  if (window.visualViewport) {
    const setVvh = () => {
      document.documentElement.style.setProperty('--vvh', window.visualViewport.height + 'px');
    };
    window.visualViewport.addEventListener('resize', setVvh);
    setVvh();
  }
})();

// ─── APP UPDATE CHECK ─────────────────────────────────────────────────────────
// Home-screen PWAs (especially on iOS) cache far more aggressively and
// persistently than a normal browser tab — a user can be stuck on a build
// from weeks ago with no obvious way to tell. This periodically re-fetches
// the page's own HTML with caching fully disabled, reads the <meta
// name="app-version"> tag out of the fresh copy, and compares it against
// the version actually running. If they differ, a banner appears; tapping
// it forces a genuinely fresh reload (cache-busted, not a normal reload).
(function() {
  const CURRENT_VERSION = document.querySelector('meta[name="app-version"]')?.content || '';
  let bannerShown = false;

  function showUpdateBanner() {
    if (bannerShown) return;
    bannerShown = true;
    const banner = document.getElementById('updateBanner');
    if (!banner) return;
    banner.style.display = 'block';

    // Push the nav bar down so the banner doesn't sit on top of it — both for
    // its initial (unscrolled) position and for its sticky "stuck" position
    // once the page is scrolled, since those are computed independently.
    requestAnimationFrame(() => {
      const bannerHeight = banner.offsetHeight;
      const nav = document.getElementById('mainNav');
      if (nav) {
        const currentMargin = parseInt(nav.style.marginTop || '0', 10) || 0;
        nav.style.marginTop = (currentMargin + bannerHeight) + 'px';
        nav.style.top = bannerHeight + 'px';
      }
      const spacer = document.getElementById('statusBarSpacer');
      if (spacer) spacer.style.marginTop = bannerHeight + 'px';
    });
  }

  function applyAppUpdate() {
    const banner = document.getElementById('updateBanner');
    if (banner) banner.textContent = '🔄 Updating…';
    // A cache-busting navigation is the most reliable way to force a truly
    // fresh copy on iOS home-screen PWAs — plain reload() isn't always enough.
    const url = new URL(location.href);
    url.searchParams.set('_v', Date.now().toString());
    location.href = url.toString();
  }
  // Only ever triggered via the update banner's data-onclick — never called
  // as plain JS elsewhere, so this is the only place it needs registering.
  registerActions({ applyAppUpdate });

  async function checkForAppUpdate() {
    if (!CURRENT_VERSION) return; // meta tag missing — nothing to compare against
    try {
      const url = new URL(location.href);
      url.hash = '';
      url.searchParams.set('_check', Date.now().toString()); // bypass any HTTP caching
      const res = await fetch(url.toString(), { cache: 'no-store' });
      if (!res.ok) return;
      const text = await res.text();
      const match = text.match(/<meta\s+name=["']app-version["']\s+content=["']([^"']+)["']/i);
      const latestVersion = match ? match[1] : null;
      if (latestVersion && latestVersion !== CURRENT_VERSION) {
        showUpdateBanner();
      }
    } catch(e) {
      // Silent — a failed check just means we try again later, no need to
      // bother the user about it.
    }
  }

  // Check shortly after load (give the app time to finish its own init first),
  // periodically while the app stays open, and — most importantly — whenever
  // the app comes back into the foreground, since that's exactly the moment
  // someone reopens it from their home screen after an update was shipped.
  setTimeout(checkForAppUpdate, 4000);
  setInterval(checkForAppUpdate, 10 * 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForAppUpdate();
  });
})();

// ─── MOBILE STATUS BAR FIX ────────────────────────────────────────────────────
(function() {
  function applyStatusBarHeight() {
    // Only apply on iOS devices — desktop and Android don't need this
    if (!/iphone|ipad|ipod/i.test(navigator.userAgent)) return;

    let statusHeight = 0;
    const testEl = document.createElement('div');
    testEl.style.cssText = 'position:fixed;top:env(safe-area-inset-top,0px);height:0;pointer-events:none;visibility:hidden;';
    document.body.appendChild(testEl);
    const envHeight = testEl.getBoundingClientRect().top;
    document.body.removeChild(testEl);

    if (envHeight > 0) {
      statusHeight = envHeight;
    } else if (window.visualViewport) {
      statusHeight = Math.round(window.visualViewport.offsetTop) || 20;
    } else {
      statusHeight = 20;
    }

    const spacer = document.getElementById('statusBarSpacer');
    const nav = document.getElementById('mainNav');
    const mobileMenu = document.querySelector('.mobile-menu');
    if (statusHeight > 0) {
      if (spacer) spacer.style.height = statusHeight + 'px';
      if (nav) nav.style.marginTop = statusHeight + 'px';
    }
    const navHeight = (nav ? nav.offsetHeight : 60) + statusHeight;
    if (mobileMenu) mobileMenu.style.top = (navHeight + 4) + 'px';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyStatusBarHeight);
  } else {
    applyStatusBarHeight();
  }
  window.addEventListener('resize', applyStatusBarHeight);
})();

// ─── PULL TO REFRESH (home page only) ────────────────────────────────────────
(function() {
  let startY = 0, pulling = false;
  const threshold = 80;

  const indicator = document.createElement('div');
  indicator.id = 'pullRefreshIndicator';
  indicator.style.cssText = `
    position: fixed; top: 0; left: 50%; transform: translateX(-50%) translateY(-60px);
    background: var(--espresso); color: var(--honey); border-radius: 0 0 20px 20px;
    padding: 8px 20px; font-size: 0.78rem; font-weight: 600;
    z-index: 2100; transition: transform 0.2s; pointer-events: none;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  `;
  indicator.textContent = '↓ Pull to refresh';
  document.body.appendChild(indicator);

  function isHomePage() {
    const homePage = document.getElementById('page-home');
    if (!homePage || !homePage.classList.contains('active')) return false;
    if (document.querySelector('.modal-overlay.open')) return false;
    if (document.getElementById('qrScannerOverlay')) return false;
    return true;
  }

  document.addEventListener('touchstart', e => {
    if (window.scrollY === 0 && isHomePage()) {
      startY = e.touches[0].clientY;
      pulling = true;
    }
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    if (!pulling) return;
    const dist = e.touches[0].clientY - startY;
    if (dist > 10 && dist < threshold + 40) {
      indicator.style.transform = `translateX(-50%) translateY(${-60 + dist * 0.6}px)`;
      indicator.textContent = dist > threshold ? '↑ Release to refresh' : '↓ Pull to refresh';
    }
  }, { passive: true });

  document.addEventListener('touchend', e => {
    if (!pulling) return;
    pulling = false;
    const dist = e.changedTouches[0].clientY - startY;
    indicator.style.transform = 'translateX(-50%) translateY(-60px)';
    indicator.textContent = '↓ Pull to refresh';
    if (dist > threshold) {
      indicator.textContent = '🔄 Refreshing…';
      indicator.style.transform = 'translateX(-50%) translateY(0px)';
      setTimeout(() => { window.location.reload(true); }, 400);
    }
  }, { passive: true });

  document.addEventListener('touchcancel', () => {
    pulling = false;
    indicator.style.transform = 'translateX(-50%) translateY(-60px)';
    indicator.textContent = '↓ Pull to refresh';
  }, { passive: true });
})();

// ─── PWA INSTALL ──────────────────────────────────────────────────────────────
let deferredInstallPrompt = null;
const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
const isInStandaloneMode = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

function showMobileInstallBtn() {
  const btn = document.getElementById('mobileInstallBtn');
  if (btn) btn.style.display = '';
}

// Android/Chrome — capture the prompt and show the menu item
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstallPrompt = e;
  showMobileInstallBtn();
});

// iOS — show menu item if not already installed
if (isIos && !isInStandaloneMode) showMobileInstallBtn();

async function triggerPwaInstall() {
  if (isIos) {
    showToast('Tap the Share button 📤 then "Add to Home Screen"');
    return;
  }
  if (!deferredInstallPrompt) {
    showToast('Open Crumbz in Chrome or Safari to install');
    return;
  }
  deferredInstallPrompt.prompt();
  const { outcome } = await deferredInstallPrompt.userChoice;
  if (outcome === 'accepted') {
    showToast('🥐 Crumbz added to your home screen!');
    const btn = document.getElementById('mobileInstallBtn');
    if (btn) btn.style.display = 'none';
  }
  deferredInstallPrompt = null;
}

registerActions({ triggerPwaInstall });

// Hide if already installed
if (isInStandaloneMode) {
  const btn = document.getElementById('mobileInstallBtn');
  if (btn) btn.style.display = 'none';
}

const isFirebaseHosting = location.hostname.endsWith('.web.app') ||
  location.hostname.endsWith('.firebaseapp.com') ||
  (!location.hostname.includes('bitbucket') &&
   !location.hostname.includes('localhost') &&
   !location.hostname.includes('127.0.0.1') &&
   !location.hostname.includes('claude.ai'));
if ('serviceWorker' in navigator && isFirebaseHosting) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
