// Turns stored blog `content` HTML into renderable article HTML.
//
// Two things the raw DB content gets wrong for saree-caption style posts:
//   1. Captions are bare text lines each trailed by a dead `<button>Copy</button>`.
//      The old sanitizer stripped every <button>, so copy did nothing at all.
//   2. The post's own <style> block was stripped too, so captions rendered as
//      undifferentiated wall-of-text paragraphs.
//
// `renderArticleHtml` keeps the sanitizing (definitely) and additionally
// recognises the caption pattern, converting each line into a card with a
// working copy button wired up by ArticleBody's delegated click handler.

const FORBIDDEN_BLOCKS = [
  /<script[\s\S]*?<\/script\s*>/gi,
  /<style[\s\S]*?<\/style\s*>/gi,
  /<\/?(iframe|object|embed|form|input|link|meta|base|svg|math)[\s\S]*?>/gi,
  /on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, // inline event handlers
  /javascript:/gi,
];

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const escapeAttr = escapeHtml;

const ARTICLE_STYLES = `
<style id="bf-article-styles">
.bf-article{font-size:16px;line-height:1.85;color:#1f2937;}
.bf-article h1{font-size:30px;line-height:1.3;font-weight:800;color:#0C1E4E;margin:0 0 18px;}
.bf-article h2{font-size:22px;line-height:1.35;font-weight:800;color:#0C1E4E;margin:34px 0 14px;padding-bottom:10px;border-bottom:2px solid #f1e3e3;}
.bf-article h3{font-size:18px;font-weight:700;color:#0C1E4E;margin:24px 0 10px;}
.bf-article p{margin:0 0 16px;}
.bf-article a{color:#A61C2C;text-decoration:underline;}
.bf-article img{max-width:100%;height:auto;display:block;margin:20px auto;border-radius:12px;}
.bf-article ul,.bf-article ol{margin:0 0 18px;padding-left:22px;}
.bf-article li{margin-bottom:8px;}
.bf-article ins[data-ad-client]{display:block;margin:28px 0;}

/* ---- caption cards ---- */
.bf-caps{margin:0 0 34px;display:flex;flex-direction:column;gap:10px;}
.bf-cap{position:relative;display:flex;align-items:flex-start;gap:12px;background:linear-gradient(180deg,#fff8f8 0%,#fff 100%);border:1px solid #f3dcdc;border-left:4px solid #A61C2C;border-radius:12px;padding:14px 14px 14px 16px;transition:box-shadow .18s ease,transform .18s ease,border-color .18s ease;}
.bf-cap:hover{box-shadow:0 6px 18px rgba(166,28,44,.10);transform:translateY(-1px);border-color:#e6bfc4;}
.bf-cap__text{flex:1;min-width:0;font-size:16px;line-height:1.75;color:#1f2937;}
.bf-cap__num{display:inline-flex;align-items:center;justify-content:center;min-width:26px;height:26px;padding:0 6px;margin-top:2px;border-radius:8px;background:#A61C2C;color:#fff;font-size:12px;font-weight:700;}
.bf-cap__body{flex:1;min-width:0;}
.bf-cap__btn{flex:0 0 auto;display:inline-flex;align-items:center;gap:6px;margin-top:1px;padding:8px 14px;border:1px solid #A61C2C;border-radius:9px;background:#A61C2C;color:#fff;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;transition:background .15s ease,color .15s ease;}
.bf-cap__btn:hover{background:#8b1220;}
.bf-cap__btn:focus-visible{outline:3px solid rgba(166,28,44,.35);outline-offset:2px;}
.bf-cap__btn.is-done{background:#0f7a3d;border-color:#0f7a3d;}

/* copy-all toolbar */
.bf-caps-bar{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:0 0 16px;padding:12px 14px;background:#0C1E4E;border-radius:12px;}
.bf-caps-bar__label{color:#fff;font-size:14px;font-weight:600;}
.bf-caps-bar__btn{padding:8px 16px;border-radius:9px;border:1px solid rgba(255,255,255,.35);background:transparent;color:#fff;font-size:13px;font-weight:700;cursor:pointer;}
.bf-caps-bar__btn:hover{background:rgba(255,255,255,.12);}
.bf-caps-bar__count{margin-left:auto;color:#cbd5e1;font-size:13px;}

/* lightweight toast */
.bf-toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%) translateY(20px);z-index:400;background:#0f172a;color:#fff;padding:11px 20px;border-radius:11px;font-size:14px;font-weight:600;box-shadow:0 10px 30px rgba(0,0,0,.28);opacity:0;pointer-events:none;transition:opacity .2s ease,transform .2s ease;}
.bf-toast.is-on{opacity:1;transform:translateX(-50%) translateY(0);}

@media (max-width:640px){
  .bf-article{font-size:15.5px;line-height:1.8;}
  .bf-article h1{font-size:24px;}
  .bf-article h2{font-size:19px;margin:28px 0 12px;}
  .bf-cap{flex-wrap:wrap;padding:13px;}
  .bf-cap__text{flex:1 1 100%;order:2;}
  .bf-cap__num{order:1;}
  .bf-cap__btn{order:3;margin-left:auto;}
}
</style>
`;

// A caption line looks like:  <caption text> <button ...>Copy</button>
// Captured lazily per-line because the DB stores them as bare lines.
const CAPTION_LINE = /^([\s\S]*?)\s*<button[^>]*>([\s\S]*?)<\/button>\s*$/i;
// NOTE: never gate caption detection on the button label. Posts store the
// button text as literally "Copy", so a label filter silently discarded every
// real caption and rendered zero cards.

export function renderArticleHtml(content: unknown): string {
  let html = String(content ?? '');

  for (const re of FORBIDDEN_BLOCKS) html = html.replace(re, '');

  // Split into lines so caption detection stays line-scoped and never eats
  // real paragraphs or the AdSense <ins> blocks between captions.
  const lines = html.split('\n');
  const out: string[] = [];
  const cards: string[] = [];
  let n = 0;

  // Captions are pushed to `cards` while scanning; splice them back into the
  // document at each caption position so the surrounding <h2> headings and
  // AdSense <ins> blocks keep their original order.
  const parts: string[] = [];
  const flushCards = () => {
    if (!cards.length) return;
    parts.push(`<div class="bf-caps">\n${cards.join('\n')}\n</div>`);
    cards.length = 0;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) { if (out.length && out[out.length - 1] !== '') out.push(''); continue; }

    const m = line.match(CAPTION_LINE);
    if (m) {
      const text = m[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
      if (text) {
        n += 1;
        cards.push(
          `<div class="bf-cap" data-caption>\n` +
            `  <span class="bf-cap__num">${n}</span>\n` +
            `  <span class="bf-cap__body"><span class="bf-cap__text">${escapeHtml(text)}</span></span>\n` +
            `  <button type="button" class="bf-cap__btn" data-copy-btn aria-label="ক্যাপশন কপি করুন">` +
            `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>` +
            `<span data-copy-label>কপি</span></button>\n` +
            `</div>`
        );
        continue;
      }
    }

    // A non-caption line ends the current run: emit what we collected, in place.
    flushCards();
    out.push(rawLine);
  }
  flushCards();

  let body = out.join('\n') + (parts.length ? '\n' + parts.join('\n') : '');

  // Copy-all toolbar, placed once above the first caption group.
  if (n) {
    const bar =
      `<div class="bf-caps-bar">` +
      `<span class="bf-caps-bar__label">সব ক্যাপশন একসাথে কপি করুন</span>` +
      `<button type="button" class="bf-caps-bar__btn" data-copy-all>সব কপি করুন (${n})</button>` +
      `<span class="bf-caps-bar__count">${n}টি ক্যাপশন</span>` +
      `</div>`;
    body = body.replace('<div class="bf-caps">', `${bar}<div class="bf-caps">`);
  }

  return `${ARTICLE_STYLES}<div class="bf-article">${body}</div>`;
}
