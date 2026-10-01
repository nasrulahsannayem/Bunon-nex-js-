import { useEffect, useRef } from 'react';
import { renderArticleHtml } from '../lib/articleHtml';

// Renders blog `content` and wires the caption copy buttons.
//
// The buttons are plain markup inside dangerouslySetInnerHTML output, so instead
// of a React onClick per card we use one delegated listener on the container.
// That keeps working after re-renders and avoids attaching handlers to HTML we
// did not create in React's tree.
export default function ArticleBody({ content }: { content: unknown }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const toastRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const toast = (msg: string) => {
      let el = toastRef.current;
      if (!el) {
        el = document.createElement('div');
        el.className = 'bf-toast';
        document.body.appendChild(el);
        toastRef.current = el;
      }
      el.textContent = msg;
      // force reflow so the transition replays on rapid copies
      void el.offsetWidth;
      el.classList.add('is-on');
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => el && el.classList.remove('is-on'), 1900);
    };

    const copyText = async (text: string): Promise<boolean> => {
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(text);
          return true;
        }
      } catch { /* fall through to the legacy path */ }
      // execCommand fallback for non-secure contexts / older mobile browsers
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.top = '-1000px';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        ta.setSelectionRange(0, ta.value.length);
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
      } catch {
        return false;
      }
    };

    const flash = (btn: HTMLElement, done: boolean) => {
      const label = btn.querySelector('[data-copy-label]');
      if (label) label.textContent = done ? 'কপি হয়েছে ✓' : 'ব্যর্থ';
      btn.classList.toggle('is-done', done);
      window.setTimeout(() => {
        if (label) label.textContent = 'কপি';
        btn.classList.remove('is-done');
      }, 1800);
    };

    const onClick = async (ev: MouseEvent) => {
      const target = ev.target as HTMLElement | null;
      if (!target || !root.contains(target)) return;

      const single = target.closest('[data-copy-btn]') as HTMLElement | null;
      if (single) {
        const card = single.closest('[data-caption]') as HTMLElement | null;
        const text = card?.querySelector('.bf-cap__text')?.textContent?.trim() || '';
        if (!text) return;
        const ok = await copyText(text);
        flash(single, ok);
        toast(ok ? 'ক্যাপশন কপি হয়েছে' : 'কপি করা যায়নি');
        return;
      }

      const all = target.closest('[data-copy-all]') as HTMLElement | null;
      if (all) {
        const texts = Array.from(root.querySelectorAll('.bf-cap__text'))
          .map((n) => (n.textContent || '').trim())
          .filter(Boolean);
        if (!texts.length) return;
        const joined = texts.join('\n');
        const ok = await copyText(joined);
        const label = all.textContent;
        all.textContent = ok ? `✓ ${texts.length}টি কপি হয়েছে` : 'কপি করা যায়নি';
        toast(ok ? `${texts.length}টি ক্যাপশন কপি হয়েছে` : 'কপি করা যায়নি');
        window.setTimeout(() => { all.textContent = label; }, 2000);
      }
    };

    root.addEventListener('click', onClick);

    // AdSense loading/pushing is owned by <AdSenseArticle />, which mounts only
    // on article routes. ArticleBody stays free of loader logic so a non-article
    // page can never pull in adsbygoogle.js.

    return () => {
      root.removeEventListener('click', onClick);
      if (timerRef.current) window.clearTimeout(timerRef.current);
      if (toastRef.current) { toastRef.current.remove(); toastRef.current = null; }
    };
  }, []);

  return (
    <div
      ref={ref}
      className="bf-article-host"
      dangerouslySetInnerHTML={{ __html: renderArticleHtml(content) }}
    />
  );
}
