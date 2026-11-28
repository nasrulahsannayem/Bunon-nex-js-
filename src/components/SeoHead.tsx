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

const removeMeta = (attr: 'name' | 'property', key: string) => {
  const el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (el) el.remove();
};

const removeLink = (rel: string) => {
  const el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (el) el.remove();
};

// Manage JSON-LD script blocks: give each a stable data-attribute so we can
// update in place instead of stacking duplicate <script> tags on every nav.
const setJsonLd = (blocks: object[]) => {
  const existing = document.head.querySelectorAll<HTMLScriptElement>('script[data-seo-jsonld]');
  existing.forEach((s) => s.remove());
  blocks.forEach((block) => {
    const s = document.createElement('script');
    s.type = 'application/ld+json';
    s.setAttribute('data-seo-jsonld', 'true');
    s.textContent = JSON.stringify(block).replace(/</g, '\u003c');
    document.head.appendChild(s);
  });
};

export interface SeoHeadProps {
  title?: string;
  description?: string;
  ogImage?: string;
  ogType?: string;
  canonicalUrl?: string;
  noindex?: boolean;
  twitterCard?: string;
  jsonLd?: object[];
}

export function SeoHead({
  title,
  description,
  ogImage,
  ogType,
  canonicalUrl,
  noindex,
  twitterCard,
  jsonLd,
}: SeoHeadProps) {
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
    if (ogImage) {
      setMeta('property', 'og:image', ogImage);
      setMeta('property', 'og:image:secure_url', ogImage);
      setMeta('name', 'twitter:image', ogImage);
    }
    if (ogType) {
      setMeta('property', 'og:type', ogType);
    }
    if (twitterCard) {
      setMeta('name', 'twitter:card', twitterCard);
    }
    // Self-referencing canonical, byte-identical to what server.ts injects for
    // crawlers: SITE_URL + req.path, with the query string dropped and NO
    // trailing-slash normalisation. Normalising here previously made
    // /product/667 emit ".../product/667/" while the origin emitted
    // ".../product/667", and Google treats those as two different URLs.
    const path = window.location.pathname || '/';
    const url = canonicalUrl || (SITE_ORIGIN + path);
    setLink('canonical', url);
    setMeta('property', 'og:url', url);

    // noindex for transactional/private pages
    if (noindex) {
      setMeta('name', 'robots', 'noindex,nofollow');
    } else {
      removeMeta('name', 'robots');
    }

    // JSON-LD structured data
    if (jsonLd && jsonLd.length) {
      setJsonLd(jsonLd);
    } else {
      setJsonLd([]);
    }

    return () => {
      // Cleanup on unmount: remove tags this component created so the next
      // route's SeoHead starts fresh instead of stacking duplicates.
      removeMeta('name', 'robots');
      setJsonLd([]);
    };
  }, [title, description, ogImage, ogType, canonicalUrl, noindex, twitterCard, jsonLd]);

  return null;
}
