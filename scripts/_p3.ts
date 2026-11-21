/**
 * Precise probes for the three remaining failures, so the report says
 * "app bug" or "test bug" with evidence rather than a guess.
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
async function fresh() {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000 });
  await page.goto('https://bunonfabrics.com/admin/login', { waitUntil: 'networkidle2' });
  await page.evaluate((t: string, user: any) => {
    localStorage.setItem('bunon_token', t);
    localStorage.setItem('bunon_user', JSON.stringify(user));
  }, token, { id: u[0].id, name: u[0].name || u[0].username, role: u[0].role });
  await page.goto('https://bunonfabrics.com/admin/inbox', { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 3000));
  return page;
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ── 1. quick reply: click the item the panel actually renders ────────── */
{
  const page = await fresh();
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button'))
      .find(x => x.getAttribute('aria-label') === 'দ্রুত উত্তর');
    b?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  });
  await wait(2500);

  const items: any = await page.evaluate(() => {
    // the panel is the sibling div of the trigger, positioned above it
    const trig = Array.from(document.querySelectorAll('button'))
      .find(x => x.getAttribute('aria-label') === 'দ্রুত উত্তর');
    const panel = trig?.parentElement?.querySelector('div.absolute');
    if (!panel) return { found: false };
    const btns = Array.from(panel.querySelectorAll('button'));
    return {
      found: true,
      count: btns.length,
      titles: btns.map(b => (b.querySelector('span')?.textContent || '').trim()).slice(0, 4),
    };
  });
  console.log('=== quick reply panel ===');
  console.log('  panel found:', items.found, '| items:', items.count);
  console.log('  titles:', JSON.stringify(items.titles));

  if (items.count > 0) {
    const before = await page.evaluate(() => {
      const ta = document.querySelector('textarea') as HTMLTextAreaElement | null;
      return ta ? ta.value : null;
    });
    const clicked = await page.evaluate(() => {
      const trig = Array.from(document.querySelectorAll('button'))
        .find(x => x.getAttribute('aria-label') === 'দ্রুত উত্তর');
      const panel = trig?.parentElement?.querySelector('div.absolute');
      const b = panel?.querySelector('button');
      if (!b) return null;
      const label = (b.textContent || '').trim().slice(0, 40);
      b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      return label;
    });
    await wait(1500);
    const after: any = await page.evaluate(() => {
      const tas = Array.from(document.querySelectorAll('textarea'));
      return tas.map(t => (t as HTMLTextAreaElement).value);
    });
    console.log('  clicked item:', JSON.stringify(clicked));
    console.log('  textarea before:', JSON.stringify(before));
    console.log('  textarea after :', JSON.stringify(after));
    console.log('  VERDICT:', after.some((v: string) => v && v.length > 0)
      ? '✅ quick reply inserts correctly'
      : '❌ real bug: onPick did not write to the composer');
  }
  await page.close();
}

/* ── 2. search: watch the network request the input fires ─────────────── */
{
  const page = await fresh();
  const calls: string[] = [];
  page.on('request', (r: any) => {
    const u = r.url();
    if (u.includes('/api/admin/omnichannel')) calls.push(u.replace(/^https?:\/\/[^/]+/, ''));
  });
  const before = await page.evaluate(() => document.querySelectorAll('[data-conv-id]').length);
  const term = await page.evaluate(() => (document.body.innerText.match(/8801\d{6}/) || [''])[0]);
  await page.click('#inbox-search');
  await page.type('#inbox-search', term.slice(-6));
  await wait(3000);
  const after = await page.evaluate(() => document.querySelectorAll('[data-conv-id]').length);
  console.log('\n=== search ===');
  console.log('  term:', JSON.stringify(term.slice(-6)), '| rows', before, '->', after);
  console.log('  api calls after typing:');
  calls.slice(-3).forEach((c) => console.log('   ', c));
  console.log('  VERDICT:', after < before
    ? '✅ search narrows the list'
    : (calls.some((c) => c.includes('q='))
        ? '❌ real bug: q sent but list not filtered'
        : '❗ search input does not fire a request at all'));
  await page.close();
}

/* ── 3. snooze: read what the API stores and returns ──────────────────── */
{
  const page = await fresh();
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button'))
      .find(x => x.getAttribute('aria-label') === 'আরও অপশন');
    b?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  });
  await wait(1200);
  const menu: any = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    return btns.map(b => (b.textContent || '').trim()).filter(t => t && t.length < 24).slice(-14);
  });
  console.log('\n=== overflow menu entries ===');
  menu.forEach((m: string) => console.log('   ', JSON.stringify(m)));

  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button'))
      .find(x => (x.textContent || '').trim() === 'স্নুজ…');
    b?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  });
  await wait(1000);
  const presets: any = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button'))
      .map(b => (b.textContent || '').trim())
      .filter(t => /ঘণ্টা|মিনিট|কাল/.test(t)));
  console.log('\n=== snooze presets ===', JSON.stringify(presets));

  const resp: any[] = [];
  page.on('response', async (r: any) => {
    if (r.url().includes('/snooze')) {
      let body: any = null;
      try { body = await r.json(); } catch {}
      resp.push({ status: r.status(), method: r.request().method(), body });
    }
  });

  const hit = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button'))
      .find(x => /১ ঘণ্টা/.test((x.textContent || '').trim()));
    if (!b) return false;
    b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    return true;
  });
  await wait(3000);
  console.log('\n=== snooze POST result ===');
  console.log('  preset clicked:', hit);
  resp.forEach((r) => console.log('  ', r.method, r.status, JSON.stringify(r.body).slice(0, 160)));

  const stored: any = await page.evaluate(async () => {
    const id = new URL(location.href).searchParams.get('conversation');
    const r = await fetch(`/api/admin/omnichannel/${id}`, { headers: { Authorization: 'Bearer ' + localStorage.getItem('bunon_token') } });
    const j: any = await r.json();
    return { id, keys: Object.keys(j?.data || {}), snoozed: j?.data?.snoozed_until, sample: JSON.stringify(j?.data).slice(0, 300) };
  });
  console.log('  GET after snooze:', JSON.stringify(stored).slice(0, 400));

  // restore
  await page.evaluate(async () => {
    const id = new URL(location.href).searchParams.get('conversation');
    await fetch(`/api/admin/omnichannel/${id}/snooze`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + localStorage.getItem('bunon_token'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ minutes: 0 }),
    });
  });
  await page.close();
}

await browser.close();
process.exit(0);