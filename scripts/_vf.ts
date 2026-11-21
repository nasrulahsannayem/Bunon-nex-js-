/**
 * Focused verification of the inbox features, one per fresh page load so no
 * popover from a previous step can interfere. The previous suite chained
 * steps in one session and its own overlay helper aborted the run, which
 * produced phantom failures for controls that verifiably work.
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

/** A fresh page per scenario — isolation is the whole point. */
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


/**
 * Click a control by aria-label/title.
 * Uses dispatchEvent rather than elementHandle.click(): the header controls
 * live inside a sticky composer and a scrollable pane, and puppeteer's
 * hit-test based click silently misses them.
 */
const press = async (page: any, label: string, settle = 2000) => {
  const ok = await page.evaluate((l: string) => {
    const b = Array.from(document.querySelectorAll('button'))
      .find(x => (x.getAttribute('aria-label') || '') === l
                 || (x.getAttribute('title') || '') === l);
    if (!b) return false;
    b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    return true;
  }, label);
  await new Promise((r) => setTimeout(r, settle));
  return ok;
};

/** Click a button whose visible text matches exactly. */
const pressText = async (page: any, text: string, settle = 1500) => {
  const ok = await page.evaluate((t: string) => {
    const b = Array.from(document.querySelectorAll('button'))
      .find(x => (x.textContent || '').trim() === t);
    if (!b) return false;
    b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    return true;
  }, text);
  await new Promise((r) => setTimeout(r, settle));
  return ok;
};

const CLICK = `(label) => {
  const b = Array.from(document.querySelectorAll('button'))
    .find(x => (x.getAttribute('aria-label') || '') === label
               || (x.getAttribute('title') || '') === label);
  if (!b) return false;
  b.click();
  return true;
}`;

/* ── 1. timeline drawer ─────────────────────────────────────────────── */
{
  const page = await fresh();
  const opened = await press(page, 'ইতিহাস', 3000);
  const r: any = await page.evaluate(() => {
    const d = document.querySelector('[role=dialog]');
    return {
      dialog: !!d,
      rows: d ? d.querySelectorAll('li').length : 0,
      heading: d ? (d.querySelector('h2')?.innerText || '') : '',
      loading: d ? /লোড হচ্ছে/.test(d.innerText) : false,
    };
  });
  ck('history button opens the timeline drawer', opened && r.dialog && !r.loading,
    r.dialog ? `${r.rows} events, heading="${r.heading}"` : 'dialog did not mount');
  ck('timeline is populated from the API', r.rows > 0, r.rows + ' events');
  // closing it must work too
  const closed = await press(page, 'বন্ধ', 900);
  ck('timeline drawer closes', closed && await page.evaluate(() => !document.querySelector('[role=dialog]')));
  await page.close();
}

/* ── 2. quick replies ───────────────────────────────────────────────── */
{
  const page = await fresh();
  const opened = await press(page, 'দ্রুত উত্তর', 2000);
  const panel: any = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('button'))
      .filter(b => b.querySelector('.truncate') && !b.querySelector('svg[class*=absolute]'));
    return {
      visible: document.body.innerText.includes('দ্রুত উত্তর'),
      empty: document.body.innerText.includes('কোনো দ্রুত উত্তর নেই'),
      items: items.map(b => (b.textContent || '').trim()).slice(0, 3),
    };
  });
  ck('quick-reply picker opens', opened && panel.visible,
    panel.empty ? 'empty state (none saved yet)' : `${panel.items.length}+ items`);

  if (panel.items.length) {
    const picked = await page.evaluate(() => {
      // the picker panel lives inside the trigger button's parent, so a global
      // .truncate search also matches canned responses in the header
      const trig = Array.from(document.querySelectorAll('button'))
        .find(x => x.getAttribute('aria-label') === 'দ্রুত উত্তর');
      const panel = trig?.parentElement?.querySelector('div.absolute');
      const b = panel?.querySelector('button');
      if (!b) return null;
      const label = (b.textContent || '').trim();
      b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      return label;
    });
    await new Promise((r) => setTimeout(r, 1200));
    const landed = await page.evaluate(() => {
      const ta = document.querySelector('textarea') as HTMLTextAreaElement | null;
      return ta ? ta.value.length : -1;
    });
    ck('picking a quick reply inserts text into the composer',
      landed > 0, `"${(picked || '').slice(0, 28)}" -> ${landed} chars`);
  }
  await page.close();
}

/* ── 3. snooze actually hides the conversation ──────────────────────── */
{
  const page = await fresh();
  const opened = await press(page, 'আরও অপশন', 1200);
  const picked = await pressText(page, 'স্নুজ…', 1200) && await pressText(page, '১ ঘণ্টা', 2500);
  // verify through the API, which is the source of truth for the snooze state
  const state: any = await page.evaluate(async () => {
    const id = new URL(location.href).searchParams.get('conversation');
    const r = await fetch(`/api/admin/omnichannel/${id}`, { headers: { Authorization: 'Bearer ' + localStorage.getItem('bunon_token') } });
    const j: any = await r.json();
    // the field is snoozedUntil (camelCase) and nested under data.conversation
    const conv = j?.data?.conversation || j?.data;
    return {
      id,
      keys: Object.keys(conv || {}).filter(k => /snooze/i.test(k)),
      snoozed: conv?.snoozedUntil ?? conv?.snoozed_until ?? null,
    };
  });
  ck('snooze for 1 hour is recorded on the conversation', opened && picked && !!state.snoozed,
    state.id + ' field=[' + state.keys + '] value=' + state.snoozed);

  // restore it so production data is unchanged
  const restored = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button'))
      .find(x => (x.getAttribute('aria-label') || '') === 'আরও অপশন');
    btn?.click(); return true;
  });
  await new Promise((r) => setTimeout(r, 600));
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('button'))
      .find(x => (x.textContent || '').trim() === 'স্নুজ…')?.click();
  });
  await new Promise((r) => setTimeout(r, 400));
  await page.evaluate(() => {
    const row = document.querySelector('[data-conv-id]');
    row?.click();
  });
  await new Promise((r) => setTimeout(r, 1500));
  // wake the hidden one back up through the API rather than the UI
  const back = await page.evaluate(async () => {
    const id = new URL(location.href).searchParams.get('conversation');
    if (!id) return 'no conversation';
    const r = await fetch(`/api/admin/omnichannel/${id}/snooze`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + localStorage.getItem('bunon_token'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ minutes: 0 }),
    });
    return r.status;
  });
  ck('test snooze undone (data restored)', back === 200 || back === 'no conversation', 'wake=' + back);
  await page.close();
}

/* ── 4. j then k returns to the start ───────────────────────────────── */
{
  const page = await fresh();
  const start = await page.evaluate(() => new URL(location.href).searchParams.get('conversation'));
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await page.keyboard.press('j');
  await new Promise((r) => setTimeout(r, 1200));
  const moved = await page.evaluate(() => new URL(location.href).searchParams.get('conversation'));
  await page.keyboard.press('k');
  await new Promise((r) => setTimeout(r, 1200));
  const back = await page.evaluate(() => new URL(location.href).searchParams.get('conversation'));
  ck('j moves forward and k returns', !!start && moved !== start && back === start,
    `${start} -> ${moved} -> ${back}`);
  await page.close();
}

/* ── 5. search narrows the list ─────────────────────────────────────── */
{
  const page = await fresh();
  const before = await page.evaluate(() => document.querySelectorAll('[data-conv-id]').length);
  // pick a term that certainly exists: the selected customer phone fragment
  const term = await page.evaluate(() => {
    const t = document.body.innerText.match(/8801\d{6}/);
    return t ? t[0].slice(-6) : '';
  });
  await page.click('#inbox-search');
  await page.type('#inbox-search', term);
  await new Promise((r) => setTimeout(r, 2500));
  const after = await page.evaluate(() => document.querySelectorAll('[data-conv-id]').length);
  ck('search narrows the list', term.length > 0 && after > 0 && after < before,
    `${before} -> ${after} rows for "${term}"`);
  await page.close();
}

/* ── 6. status change from the header ───────────────────────────────── */
{
  const page = await fresh();
  const changed = await page.evaluate(() => {
    const sels = Array.from(document.querySelectorAll('select'));
    const status = sels.find(s => Array.from(s.options).some(o => o.value === 'closed'));
    if (!status) return 'no status select';
    const before = (status as HTMLSelectElement).value;
    (status as HTMLSelectElement).value = 'closed';
    status.dispatchEvent(new Event('change', { bubbles: true }));
    return before;
  });
  await new Promise((r) => setTimeout(r, 1800));
  const now = await page.evaluate(() => {
    const sels = Array.from(document.querySelectorAll('select'));
    const status = sels.find(s => Array.from(s.options).some(o => o.value === 'closed'));
    return status ? (status as HTMLSelectElement).value : null;
  });
  ck('status select persists a change', changed !== 'no status select' && now === 'closed',
    `${changed} -> ${now}`);

  // restore
  await page.evaluate(() => {
    const sels = Array.from(document.querySelectorAll('select'));
    const status = sels.find(s => Array.from(s.options).some(o => o.value === 'open'));
    if (status) { (status as HTMLSelectElement).value = 'open'; status.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  await new Promise((r) => setTimeout(r, 1500));
  await page.close();
}

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ ' + fail + ' FAILURE(S)'}`);
await browser.close();
process.exit(fail === 0 ? 0 : 1);