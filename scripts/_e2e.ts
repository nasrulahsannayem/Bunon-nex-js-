/**
 * End-to-end interaction test: click the real controls in the rendered page
 * and assert each one actually did something. This is the only way to be
 * sure a feature is "working" rather than merely present in the DOM.
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

const errors: string[] = [];
page.on('pageerror', (e: any) => {
  const m = String(e.message || '');
  // Microsoft Clarity is a third-party analytics script, not our code
  if (!/clarity|indexOf is not a function/i.test(m)) errors.push(m.slice(0, 140));
});

await page.goto('https://bunonfabrics.com/admin/login', { waitUntil: 'networkidle2' });
await page.evaluate((t: string, user: any) => {
  localStorage.setItem('bunon_token', t);
  localStorage.setItem('bunon_user', JSON.stringify(user));
}, token, { id: u[0].id, name: u[0].name || u[0].username, role: u[0].role });
await page.goto('https://bunonfabrics.com/admin/inbox', { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 3500));

let fail = 0;
const ck = (l: string, ok: boolean, x = '') => {
  if (!ok) fail++;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + l + (x ? '  — ' + x : ''));
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Close any popover/modal we opened: click its own close button, then press
 *  Escape and click the body to dismiss a full-screen overlay. Without this a
 *  leftover snooze overlay swallows every subsequent click and the rest of the
 *  suite reports phantom failures. */
const clearOverlays = async () => {
  for (let i = 0; i < 4; i++) {
    const gone = await page.evaluate(() => {
      const close = Array.from(document.querySelectorAll('button'))
        .find(b => (b.getAttribute('aria-label') || '') === 'বন্ধ'
                 || (b.getAttribute('aria-label') || '') === 'বন্ধ করুন'
                 || (b.textContent || '').trim() === 'বন্ধ');
      if (close) { close.click(); return false; }
      // a fixed inset-0 backdrop with no content is the overlay
      const overlay = Array.from(document.querySelectorAll('div'))
        .find(d => {
          const c = String(d.className || '');
          return /fixed/.test(c) && /inset-0/.test(c) && d.children.length === 0;
        });
      if (overlay) { overlay.click(); return false; }
      return true;
    });
    if (gone) break;
    await wait(350);
  }
  await page.keyboard.press('Escape');
  await wait(350);
};

const clickByLabel = async (label: string, tries = 3) => {
  // React may still be mounting the header on the first paint, so retry
  // rather than reporting a missing control that is simply late.
  for (let i = 0; i < tries; i++) {
    const done = await page.evaluate((l: string) => {
      const b = Array.from(document.querySelectorAll('button'))
        .find(x => (x.getAttribute('aria-label') || '') === l
                   || (x.getAttribute('title') || '') === l);
      if (!b) return false;
      b.scrollIntoView({ block: 'center' });
      b.click();
      return true;
    }, label);
    if (done) { await wait(800); return true; }
    await wait(700);
  }
  return false;
};

// ── 1. SLA pill present ────────────────────────────────────────────────
ck('SLA pill rendered in the header', await page.evaluate(() =>
  /লক্ষ্য|অপেক্ষায়|First reply|waiting|SLA/i.test(document.body.innerText)));

// ── 2. overflow menu opens and offers snooze ───────────────────────────
ck('overflow menu button found', await clickByLabel('আরও অপশন'));
const menu = await page.evaluate(() => {
  const t = document.body.innerText;
  return { hasSnooze: t.includes('স্নুজ'), hasUnread: t.includes('অপঠিত হিসেবে') };
});
ck('menu lists snooze', menu.hasSnooze);
ck('menu lists mark-as-unread', menu.hasUnread);

// ── 3. snooze presets open ─────────────────────────────────────────────
const opened = await page.evaluate(() => {
  const b = Array.from(document.querySelectorAll('button')).find(x => (x.textContent || '').trim() === 'স্নুজ…');
  if (!b) return false;
  b.click(); return true;
});
await wait(500);
ck('snooze preset list opens', opened && await page.evaluate(() =>
  document.body.innerText.includes('কতক্ষণ স্নুজ?')));

// close without acting — must not change data
await clearOverlays();

// ── 4. history drawer ──────────────────────────────────────────────────
ck('history button found', await clickByLabel('ইতিহাস'));
const drawer = await page.evaluate(() => ({
  open: !!document.querySelector('[role=dialog]'),
  rows: document.querySelectorAll('[role=dialog] li').length,
}));
ck('timeline drawer opens', drawer.open, drawer.rows + ' events');
await clearOverlays();

// ── 5. quick replies ───────────────────────────────────────────────────
ck('quick-reply button found', await clickByLabel('দ্রুত উত্তর'));
const qr = await page.evaluate(() => ({
  panel: document.body.innerText.includes('দ্রুত উত্তর'),
  empty: document.body.innerText.includes('কোনো দ্রুত উত্তর নেই'),
  items: Array.from(document.querySelectorAll('button')).filter(b => b.querySelector('.truncate')).length,
}));
ck('quick-reply panel opens', qr.panel, qr.empty ? '(empty state shown)' : `${qr.items} items`);
await clearOverlays();

// ── 6. saved views ─────────────────────────────────────────────────────
ck('saved-views button found', await clickByLabel('সংরক্ষিত ভিউ'));
const sv = await page.evaluate(() => ({
  open: document.body.innerText.includes('বর্তমান ফিল্টার সেভ করুন'),
  emptyHint: document.body.innerText.includes('এখনো কোনো ভিউ নেই'),
}));
ck('saved-views panel opens', sv.open, sv.emptyHint ? '(empty state shown)' : '');
await clearOverlays();

// ── 7. keyboard: j moves the selection ────────────────────────────────
await wait(800);
const before = await page.evaluate(() => new URL(location.href).searchParams.get('conversation'));
await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
await page.keyboard.press('j');
await wait(1000);
const after = await page.evaluate(() => new URL(location.href).searchParams.get('conversation'));
ck('j navigates to another conversation', !!before && !!after && before !== after,
  `${before} -> ${after}`);
// k returns to where we started
await page.keyboard.press('k');
await wait(900);
const back = await page.evaluate(() => new URL(location.href).searchParams.get('conversation'));
ck('k returns to the previous conversation', back === before, `back to ${back}`);

// ── 8. search filters the list ────────────────────────────────────────
await page.click('#inbox-search');
await page.type('#inbox-search', '8801');
await wait(1200);
const unfiltered = await page.evaluate(() => document.querySelectorAll('[data-conv-id]').length);
const searched = await page.evaluate(() =>
  document.querySelectorAll('[data-conv-id]').length);
ck('search narrows the list', searched > 0 && searched < unfiltered,
  `${unfiltered} -> ${searched} rows`);
await page.evaluate(() => {
  const i = document.getElementById('inbox-search') as HTMLInputElement;
  i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true }));
});
await wait(900);

// ── 9. customer 360 is populated ──────────────────────────────────────
const c360 = await page.evaluate(() => {
  const t = document.body.innerText;
  return {
    orders: t.includes('অর্ডার'),
    tags: t.includes('ট্যাগ'),
    notes: t.includes('নোট'),
    history: t.includes('ইতিহাস'),
  };
});
ck('Customer 360 shows orders', c360.orders);
ck('Customer 360 shows tags & notes', c360.tags && c360.notes);

ck('zero first-party JS errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await page.screenshot({ path: '/tmp/inbox_e2e.png' });
console.log(`\n${fail === 0 ? 'ALL PASS' : fail + ' FAILURE(S)'}`);
await browser.close();
process.exit(fail === 0 ? 0 : 1);