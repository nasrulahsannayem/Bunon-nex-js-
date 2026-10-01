// Per-route <head> management for the SPA (human browsers).
// Crawlers get server-side injected meta from server.ts; this keeps the
// document head correct after client-side navigation so the canonical never
// drifts back to the static index.html default.
import { useEffect } from 'react';

export const SITE_ORIGIN = 'https://bunonfabrics.com';

const setMeta = (attr: 'name' | 'property', key: string, content: string) => {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
};

const setLink = (rel: string, href: string) => {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
};

export function SeoHead({ title, description }: { title?: string; description?: string }) {
  useEffect(() => {
    if (title) {
      document.title = title;
      setMeta('name', 'twitter:title', title);
      setMeta('property', 'og:title', title);
    }
    if (description) {
      setMeta('name', 'description', description);
      setMeta('name', 'twitter:description', description);
      setMeta('property', 'og:description', description);
    }
    // Self-referencing canonical, byte-identical to what server.ts injects for
    // crawlers: SITE_URL + req.path, with the query string dropped and NO
    // trailing-slash normalisation. Normalising here previously made
    // /product/667 emit ".../product/667/" while the origin emitted
    // ".../product/667", and Google treats those as two different URLs.
    const path = window.location.pathname || '/';
    const url = SITE_ORIGIN + path;
    setLink('canonical', url);
    setMeta('property', 'og:url', url);
  }, [title, description]);

  return null;
}
