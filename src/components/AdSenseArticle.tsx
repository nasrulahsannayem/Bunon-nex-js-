import { useEffect } from 'react';

// Google AdSense loader — BLOG POST PAGES ONLY.
//
// Scope decision (2026-09-29): the loader script and the ad units are wanted on
// article pages only. Homepage, /shop, /product, /product-category, /blog
// (the listing) and /order-received must NOT load adsbygoogle.js, so AdSense
// never sees a script on a page that has no unit to fill.
//
// The script is injected on demand instead of sitting in index.html, because a
// static tag in index.html runs on every route of this SPA. It is also appended
// per article render, and the loader only defines window.adsbygoogle once per
// page load, so a second injection is a no-op by design.

const CLIENT = 'ca-pub-2320280231648272';
const SRC = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${CLIENT}`;

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

function loadScript(): Promise<boolean> {
  return new Promise((resolve) => {
    const w = window as Window;
    if (w.adsbygoogle) return resolve(true);
    // Another instance may already be in flight.
    const existing = document.querySelector<HTMLScriptElement>(`script[data-bf-adsense="${CLIENT}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(true));
      existing.addEventListener('error', () => resolve(false));
      return;
    }
    const s = document.createElement('script');
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.src = SRC;
    s.setAttribute('data-bf-adsense', CLIENT);
    s.addEventListener('load', () => resolve(true));
    s.addEventListener('error', () => resolve(false));
    document.head.appendChild(s);
  });
}

export default function AdSenseArticle({ enabled = true }: { enabled?: boolean }) {
  useEffect(() => {
    if (!enabled) return;
    let alive = true;

    const pushAll = (): number => {
      const w = window as Window;
      if (!w.adsbygoogle) return -1;
      const units = Array.from(document.querySelectorAll('ins[data-ad-client]')) as HTMLElement[];
      let pushed = 0;
      for (const el of units) {
        const key = el.getAttribute('data-ad-slot') || el.getAttribute('data-ad-client') || '';
        // AdSense injects one of its own unit with no slot; skip that one.
        if (!key) continue;
        if (el.getAttribute('data-bf-pushed') === key) continue;
        el.setAttribute('data-bf-pushed', key);
        w.adsbygoogle.push({});
        pushed += 1;
      }
      return pushed;
    };

    // Article content arrives from an async fetch, so <ins> elements appear
    // AFTER this component mounts. Polling alone proved unreliable (a single
    // push landed, then the scan stopped). Watch the document instead: any
    // newly added unit is pushed the moment it exists.
    const mo = new MutationObserver(() => { pushAll(); });
    mo.observe(document.body, { childList: true, subtree: true });

    const started = Date.now();
    const MAX_MS = 30000;
    const tick = () => {
      if (!alive) return;
      const total = document.querySelectorAll('ins[data-ad-slot]').length;
      const marked = document.querySelectorAll('ins[data-bf-pushed]').length;

      if (total > 0 && marked >= total) {
        console.info('[AdSense] all ' + marked + ' article unit(s) pushed');
        window.clearInterval(watch);
        return;
      }
      if (Date.now() - started > MAX_MS) {
        console.warn('[AdSense] gave up: total=' + total + ' marked=' + marked);
        window.clearInterval(watch);
        return;
      }
      pushAll();
    };
    const watch = window.setInterval(tick, 500);

    loadScript().then((ok) => {
      if (!alive) return;
      if (!ok) { console.warn('[AdSense] adsbygoogle.js failed to load'); return; }
      // The loader only consumes window.adsbygoogle if the page creates the
      // array first; the script itself never defines it.
      (window as Window).adsbygoogle = (window as Window).adsbygoogle || [];
      tick();
    });

    return () => {
      alive = false;
      mo.disconnect();
      window.clearInterval(watch);
    };
  }, [enabled]);

  return null;
}
