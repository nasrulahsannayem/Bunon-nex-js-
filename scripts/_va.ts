/**
 * Full realtime verification of the omnichannel inbox against the live site.
 * Everything is measured from the rendered page and the live API — no mocks.
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
  headless: true, executablePath: '/snap/bin/chromium',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
    '--disable-gpu', '--ignore-certificate-errors'],
});

let fail = 0;
const ck = (l: string, ok: boolean, x = '') => {
  if (!ok) fail++;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + l + (x ? '  — ' + x : ''));
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fresh(path = '/admin/inbox') {
  const page = await browser.newPage();
  const errs: string[] = [];
  const failedReq: string[] = [];
  page.on('pageerror', (e: any) => {
    const m = String(e.message || '');
    // Microsoft Clarity is a third-party analytics script, not our code
    if (!/clarity|indexOf is not a function/i.test(m)) errs.push(m.slice(0, 100));
  });
  page.on('response', (r: any) => {
    if (r.status() >= 400 && r.url().includes('/api/')) {
      failedReq.push(r.status() + ' ' + r.url().replace(/^https?:\/\/[^/]+/, ''));
    }
  });
  page.on('requestfailed', (r: any) => {
    const u = r.url();
    if (u.includes('fbcdn') || u.includes('image-proxy')) {
      failedReq.push('NET ' + u.slice(-46));
    }
  });
  await page.setViewport({ width: 1600, height: 1000 });
  await page.goto('https://bunonfabrics.com/admin/login', { waitUntil: 'networkidle2' });
  await page.evaluate((t: string, usr: any) => {
    localStorage.setItem('bunon_token', t);
    localStorage.setItem('bunon_user', JSON.stringify(usr));
  }, token, { id: u[0].id, name: u[0].name || u[0].username, role: u[0].role });
  await page.goto('https://bunonfabrics.com' + path, { waitUntil: 'networkidle2', timeout: 60000 });
  await wait(4500);
  return { page, errs, failedReq };
}

/* ── 1. inbox loads with zero failed API calls ─────────────────────── */
{
  const { page, errs, failedReq } = await fresh('/admin/inbox');
  const s = await page.evaluate(() => ({
    rows: document.querySelectorAll('[data-conv-id]').length,
    pills: document.querySelectorAll('button').length,
    hasError: /Failed to load|লোড করা যায়নি/.test(document.body.innerText),
    bengali: (document.body.innerText.match(/[ঀ-৿]+/g) || []).length,
  }));
  ck('inbox renders conversations', s.rows > 0, s.rows + ' rows');
  ck('no "failed to load" banner', !s.hasError);
  ck('zero failed API requests', failedReq.length === 0, failedReq.slice(0, 3).join(' | '));
  ck('zero first-party JS errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  ck('Bengali UI text present', s.bengali > 50, s.bengali + ' runs');
  await page.close();
}

/* ── 2. media actually renders in a real image thread ──────────────── */
{
  const { page } = await fresh('/admin/inbox?conversation=678');
  // scroll the thread so lazy media enters the viewport
  for (let i = 0; i < 8; i++) {
    await page.evaluate(() => {
      Array.from(document.querySelectorAll('div'))
        .filter((d: any) => getComputedStyle(d).overflowY === 'auto')
        .forEach((e: any) => { e.scrollTop = e.scrollHeight; });
    });
    await wait(900);
  }
  const m = await page.evaluate(() => {
    const img = Array.from(document.querySelectorAll('img')) as any[];
    const aud = Array.from(document.querySelectorAll('audio')) as any[];
    const vid = Array.from(document.querySelectorAll('video')) as any[];
    const loaded = img.filter((i: any) => i.naturalWidth > 0);
    return {
      imgs: img.length,
      imgsLoaded: loaded.length,
      realSizes: loaded.slice(0, 4).map((i: any) => i.naturalWidth + 'x' + i.naturalHeight),
      audio: aud.length,
      audioReady: aud.filter((a: any) => a.readyState >= 1).length,
      video: vid.length,
      placeholder: /আর পাওয়া যাচ্ছে না/.test(document.body.innerText),
    };
  });
  ck('images render at real dimensions', m.imgsLoaded > 5,
    `${m.imgsLoaded}/${m.imgs} loaded, sizes ${m.realSizes.join(', ')}`);
  ck('audio messages playable', m.audioReady > 0, `${m.audioReady}/${m.audio} ready`);
  ck('no dead-media placeholder spam', !m.placeholder);
  await page.screenshot({ path: '/tmp/v_media.png' });
  await page.close();
}

/* ── 3. the three panels ────────────────────────────────────────────── */
{
  const { page } = await fresh('/admin/inbox?conversation=678');
  const t = await page.evaluate(() => {
    const b = document.body.innerText;
    return {
      c360: /কাস্টমার|Customer|অর্ডার|ট্যাগ|নোট/.test(b),
      composer: !!document.querySelector('textarea'),
      search: !!document.getElementById('inbox-search'),
      header: /টাইমলাইন|ইতিহাস/.test(b) || document.querySelectorAll('button[aria-label]').length > 8,
    };
  });
  ck('Customer 360 panel present', t.c360);
  ck('composer input present', t.composer);
  ck('search box present', t.search);
  ck('header action buttons present', t.header);
  await page.close();
}

/* ── 4. keyboard nav ────────────────────────────────────────────────── */
{
  const { page } = await fresh('/admin/inbox');
  await wait(1500);
  const start = await page.evaluate(() => new URL(location.href).searchParams.get('conversation'));
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await page.keyboard.press('j');
  await wait(1100);
  const moved = await page.evaluate(() => new URL(location.href).searchParams.get('conversation'));
  await page.keyboard.press('k');
  await wait(1100);
  const back = await page.evaluate(() => new URL(location.href).searchParams.get('conversation'));
  ck('j/k navigate conversations', !!start && moved !== start && back === start,
    `${start} -> ${moved} -> ${back}`);
  await page.close();
}

/* ── 5. search ──────────────────────────────────────────────────────── */
{
  const { page } = await fresh('/admin/inbox');
  const before = await page.evaluate(() => document.querySelectorAll('[data-conv-id]').length);
  await page.click('#inbox-search');
  await page.type('#inbox-search', '772732');
  await wait(2200);
  const after = await page.evaluate(() => document.querySelectorAll('[data-conv-id]').length);
  ck('search filters the list', after > 0 && after < before, `${before} -> ${after} rows`);
  await page.close();
}

/* ── 6. no stale-token trap ─────────────────────────────────────────── */
{
  const page = await browser.newPage();
  await page.goto('https://bunonfabrics.com/admin/login', { waitUntil: 'networkidle2' });
  await page.evaluate(() => {
    localStorage.setItem('bunon_token', 'eyJhbGciOiJIUzI1NiJ9.eyJpZCI6MX0.deadSignature');
    localStorage.setItem('bunon_user', JSON.stringify({ id: 1, name: 'x', role: 'super_admin' }));
  });
  await page.goto('https://bunonfabrics.com/admin/inbox', { waitUntil: 'networkidle2', timeout: 60000 });
  await wait(4000);
  const where = await page.evaluate(() => location.pathname);
  ck('stale token redirects to login (not a dead screen)', where.includes('/login'), where);
  await page.close();
}

/* ── 7. mobile layout ───────────────────────────────────────────────── */
{
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true });
  await page.goto('https://bunonfabrics.com/admin/login', { waitUntil: 'networkidle2' });
  await page.evaluate((t: string, usr: any) => {
    localStorage.setItem('bunon_token', t);
    localStorage.setItem('bunon_user', JSON.stringify(usr));
  }, token, { id: u[0].id, name: u[0].name || u[0].username, role: u[0].role });
  await page.goto('https://bunonfabrics.com/admin/inbox', { waitUntil: 'networkidle2', timeout: 60000 });
  await wait(4500);
  const mob = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    scrollW: document.documentElement.scrollWidth,
    vw: window.innerWidth,
  }));
  ck('no horizontal overflow on mobile', !mob.overflow, `${mob.scrollW} vs ${mob.vw}`);
  await page.screenshot({ path: '/tmp/v_mobile.png' });
  await page.close();
}

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ ' + fail + ' FAILURE(S)'}`);
await browser.close();
process.exit(fail === 0 ? 0 : 1);