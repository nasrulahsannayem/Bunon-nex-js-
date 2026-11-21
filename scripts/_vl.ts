/**
 * Verify the e2e script's own literals against the live DOM, instead of
 * trusting that the bytes survived the transfer. The symptom (a control that
 * provably exists in the page not being found) points at the test's string
 * literals, not at the app.
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
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000 });
await page.goto('https://bunonfabrics.com/admin/login', { waitUntil: 'networkidle2' });
await page.evaluate((t: string, user: any) => {
  localStorage.setItem('bunon_token', t);
  localStorage.setItem('bunon_user', JSON.stringify(user));
}, token, { id: u[0].id, name: u[0].name || u[0].username, role: u[0].role });
await page.goto('https://bunonfabrics.com/admin/inbox', { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 3500));

// the labels exactly as the e2e script spells them
import fs from 'fs';
const src = fs.readFileSync('/www/wwwroot/bunon.shop/scripts/_e2e.ts', 'utf-8');

const wanted = [...src.matchAll(/clickByLabel\('([^']+)'\)/g)].map((m) => m[1]);
console.log('labels the suite looks for:');
for (const w of wanted) {
  console.log(`   "${w}"  codepoints=${[...w].map((c) => c.codePointAt(0)!).join(',')}`);
}

const found = await page.evaluate((ws: string[]) => {
  const out: any = {};
  for (const w of ws) {
    const b = Array.from(document.querySelectorAll('button')).find(
      (x: any) => (x.getAttribute('aria-label') || '') === w || (x.getAttribute('title') || '') === w);
    out[w] = !!b;
  }
  return out;
}, wanted);

console.log('\nmatch result:');
for (const [k, v] of Object.entries(found)) console.log(`   ${v ? 'FOUND   ' : 'MISSING '} ${k}`);

// what the page actually offers
const actual: any = await page.evaluate(() => {
  const a: string[] = [];
  document.querySelectorAll('button').forEach((b: any) => {
    const l = b.getAttribute('aria-label'); const t = b.getAttribute('title');
    if (l) a.push(l); if (t && t !== l) a.push(t);
  });
  return a;
});
console.log('\nlabels the page offers:');
actual.forEach((a) => console.log('   ', a));

await browser.close();
process.exit(0);