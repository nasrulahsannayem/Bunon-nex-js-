const WebSocket = require('ws');
const BASE = process.argv[2] || 'http://127.0.0.1:9222';
const ORIGIN = process.argv[3] || 'https://bunonfabrics.com';
const PAGES = ['/', '/shop', '/product/667', '/product-category/saree', '/blog', '/faq'];

(async () => {
  const ver = await fetch(BASE + '/json/version').then(r => r.json());
  const ws = new WebSocket(ver.webSocketDebuggerUrl, { origin: 'http://localhost' });
  let id = 0; const pend = new Map();
  const send = (method, params, sessionId) => new Promise(res => {
    const m = ++id; pend.set(m, res);
    ws.send(JSON.stringify({ id: m, method, params: params || {}, sessionId }));
  });
  await new Promise(r => ws.on('open', r));
  ws.on('message', d => {
    const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  });

  const { targetId } = (await send('Target.createTarget', { url: 'about:blank' })).result;
  const { sessionId } = (await send('Target.attachToTarget', { targetId, flatten: true })).result;
  await send('Page.enable', {}, sessionId);
  await send('Runtime.enable', {}, sessionId);

  const results = [];
  for (const ua of ['BOT', 'BROWSER']) {
    for (const path of PAGES) {
      await send('Emulation.setUserAgentOverride',
        { userAgent: ua === 'BOT'
            ? 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
            : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36' },
        sessionId);
      await send('Page.navigate', { url: ORIGIN + path }, sessionId);
      await new Promise(r => setTimeout(r, 4500));
      const expr = `(() => {
        const root = document.getElementById('root');
        return JSON.stringify({
          children: root ? root.children.length : -1,
          textLen: document.body.innerText.trim().length,
          brokenImgs: [...document.images].filter(i => i.complete && i.naturalWidth === 0).length,
          title: document.title.slice(0, 55),
          seoBody: !!document.getElementById('seo-body')
        });
      })()`;
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true }, sessionId);
      const v = JSON.parse(r.result?.result?.value || '{}');
      results.push({ ua, path, ...v });
    }
  }

  console.log('=== RENDER CHECK (children>0 means NOT a white screen) ===');
  let bad = 0;
  for (const r of results) {
    const white = r.children <= 0;
    const broken = r.brokenImgs > 0;
    // seo-body must exist ONLY for the bot
    const seoOk = r.ua === 'BOT' ? r.seoBody === true : r.seoBody === false;
    if (white || broken || !seoOk) bad++;
    console.log(
      `${r.ua.padEnd(7)} ${r.path.padEnd(26)} root=${String(r.children).padStart(3)} text=${String(r.textLen).padStart(5)} brokenImgs=${r.brokenImgs} seoBody=${r.seoBody ? 'Y' : 'n'} ${white ? 'WHITE-SCREEN!' : ''}${broken ? ' BROKEN-IMG!' : ''}${seoOk ? '' : ' SEO-BODY-WRONG-UA!'} | ${r.title}`
    );
  }
  console.log(bad === 0 ? '\nPASS: no white screens, no broken images, seo-body scoped to crawlers' : `\nFAIL: ${bad} issue(s)`);
  await send('Target.closeTarget', { targetId });
  ws.close();
  process.exit(bad === 0 ? 0 : 1);
})().catch(e => { console.error('CDP error:', e.message); process.exit(2); });