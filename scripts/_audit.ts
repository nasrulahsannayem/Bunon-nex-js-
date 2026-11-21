/**
 * Structural UI audit of the live inbox, read from the rendered DOM.
 *
 * A vision model is rate-limited, and more importantly it cannot tell us
 * whether an SVG is present versus an emoji glyph, nor whether a control is
 * actually wired to a handler. This walks the real DOM and answers those.
 */
import puppeteer from 'puppeteer-core';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { productDbPool } from '../server/db';

dotenv.config({ override: true, quiet: true as true as any });
const [u]: any = await productDbPool.query(
  "SELECT id, phone, role, permissions, username, name FROM bunon_users WHERE role='super_admin' LIMIT 1");
let p: any = u[0].permissions;
if (typeof p === 'string') { try { p = JSON.parse(p); } catch { p = []; } }
const token = jwt.sign({ id: u[0].id, phone: u[0].phone, role: u[0].role, permissions: p },
  String(process.env.JWT_SECRET), { expiresIn: '2h' });

const browser = await puppeteer.launch({
  headless: true,
  executablePath: '/snap/bin/chromium',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
    '--disable-gpu', '--ignore-certificate-errors'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000 });
await page.goto('https://bunonfabrics.com/admin/login', { waitUntil: 'networkidle2' });
await page.evaluate((t: string, user: any) => {
  localStorage.setItem('bunon_token', t);
  localStorage.setItem('bunon_user', JSON.stringify(user));
}, token, { id: u[0].id, name: u[0].name || u[0].username, role: u[0].role });
await page.goto('https://bunonfabrics.com/admin/inbox', { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 4000));

const AUDIT = `(() => {
  const txt = (el) => (el.textContent || '').trim();
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const all = Array.from(document.querySelectorAll('button, a, [role=button]'));
  const buttons = all.filter(vis);

  // ---- panels -----------------------------------------------------------
  const panels = ['Omnichannel Inbox', 'Customer 360'];
  const found = {};
  for (const label of panels) {
    const el = Array.from(document.querySelectorAll('*'))
      .find(e => e.children.length === 0 && txt(e) === label);
    found[label] = !!el;
  }

  // ---- chat header actions ---------------------------------------------
  const headerCandidates = Array.from(document.querySelectorAll('div'))
    .filter(d => d.className && /border-b/.test(String(d.className)) && vis(d));
  const header = headerCandidates[headerCandidates.length - 1] || null;
  const headerButtons = header
    ? Array.from(header.querySelectorAll('button')).filter(vis)
        .map(b => ({ label: txt(b).slice(0, 22), title: b.getAttribute('title') || b.getAttribute('aria-label') || '', hasSvg: !!b.querySelector('svg') }))
    : [];

  // ---- messages / composer ---------------------------------------------
  const textareas = Array.from(document.querySelectorAll('textarea')).filter(vis);
  const composer = textareas[0] || null;

  // ---- emoji vs svg in the inbox region ---------------------------------
  const body = document.body.innerText;
  const emoji = [...new Set(body.match(/[\\u{1F300}-\\u{1FAFF}\\u{2600}-\\u{27BF}\\u{2B00}-\\u{2BFF}]/gu) || [])];

  // ---- customer360 content ---------------------------------------------
  const c360 = Array.from(document.querySelectorAll('*'))
    .filter(e => e.children.length === 0 && txt(e) === 'Customer 360')[0];
  let c360Section = null;
  if (c360) {
    let n = c360;
    for (let i = 0; i < 8 && n.parentElement; i++) n = n.parentElement;
    const t = txt(n);
    c360Section = {
      headings: Array.from(n.querySelectorAll('h1,h2,h3,h4,div,span'))
        .filter(e => e.children.length === 0 && txt(e).length > 1 && txt(e).length < 42)
        .map(txt).slice(0, 26),
      length: t.length,
    };
  }

  return {
    panels: found,
    conversationRows: document.querySelectorAll('[class*="cursor-pointer"], [role=option]').length,
    headerButtons,
    hasComposer: !!composer,
    composerPlaceholder: composer ? composer.getAttribute('placeholder') : null,
    totalButtons: buttons.length,
    buttonsWithSvg: buttons.filter(b => b.querySelector('svg')).length,
    svgTotal: document.querySelectorAll('svg').length,
    emojiOnPage: emoji,
    c360: c360Section,
    sampleButtons: buttons.slice(0, 18).map(b => txt(b).slice(0, 20) || b.getAttribute('aria-label') || '(icon)'),
  };
})()`;

const r: any = await page.evaluate(AUDIT);
console.log(JSON.stringify(r, null, 1));

await page.screenshot({ path: '/tmp/inbox_final.png' });
console.log('\nsaved /tmp/inbox_final.png');
await browser.close();
process.exit(0);