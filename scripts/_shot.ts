/**
 * Screenshot /admin/inbox the way an admin sees it: log in with a real
 * session token injected into localStorage, then capture the rendered page
 * so the UI can be reviewed visually instead of guessed at.
 */
import puppeteer from 'puppeteer-core';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { productDbPool } from '../server/db';

dotenv.config({ override: true, quiet: true as any });
const [u]: any = await productDbPool.query(
  "SELECT id, phone, role, permissions, username, name FROM bunon_users WHERE role='super_admin' LIMIT 1");
let p: any = u[0].permissions;
if (typeof p === 'string') { try { p = JSON.parse(p); } catch { p = []; } }
const token = jwt.sign({ id: u[0].id, phone: u[0].phone, role: u[0].role, permissions: p },
  String(process.env.JWT_SECRET), { expiresIn: '2h' });

const browser = await puppeteer.launch({
  headless: true,
  executablePath: '/snap/bin/chromium',
  args: [
    '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
    '--disable-gpu', '--ignore-certificate-errors',
  ],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000 });

await page.goto('https://bunonfabrics.com/admin/login', { waitUntil: 'networkidle2' });
await page.evaluate((t: string, user: any) => {
  localStorage.setItem('bunon_token', t);
  localStorage.setItem('bunon_user', JSON.stringify(user));
}, token, { id: u[0].id, name: u[0].name || u[0].username, role: u[0].role });

const errors: string[] = [];
page.on('console', (m: any) => { if (m.type() === 'error') errors.push(m.text().slice(0, 170)); });
page.on('pageerror', (e: any) => errors.push('PAGEERROR ' + String(e.message).slice(0, 170)));

await page.goto('https://bunonfabrics.com/admin/inbox', { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 4500));

await page.screenshot({ path: '/tmp/inbox_desktop.png' });
console.log('saved /tmp/inbox_desktop.png');

await page.setViewport({ width: 414, height: 900 });
await new Promise((r) => setTimeout(r, 1800));
await page.screenshot({ path: '/tmp/inbox_mobile.png' });
console.log('saved /tmp/inbox_mobile.png');

console.log('console errors:', errors.length);
errors.slice(0, 8).forEach((e) => console.log('  ', e));

const summary: any = await page.evaluate(() => {
  const t = document.body.innerText;
  return {
    title: document.title,
    emojiCount: (t.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/gu) || []).length,
    emojiSample: [...new Set(t.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/gu) || [])],
    svgIcons: document.querySelectorAll('svg').length,
    buttons: document.querySelectorAll('button').length,
    inputs: document.querySelectorAll('input,textarea').length,
    firstText: t.slice(0, 400).replace(/\n+/g, ' | '),
  };
});
console.log('summary:', JSON.stringify(summary, null, 1));
await browser.close();
process.exit(0);