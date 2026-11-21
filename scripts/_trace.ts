/**
 * Pin down the persistent `TypeError: t.indexOf is not a function`.
 *
 * It survived every rebuild, so it is in a vendor chunk. Rather than guess,
 * capture the stack with a real source map of the offending frame: install a
 * window.onerror trap BEFORE the bundle runs, so we get the stack including
 * the minified file and line, then read that line out of the built chunk.
 */
import puppeteer from 'puppeteer-core';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { productDbPool } from '../server/db';
import fs from 'fs';

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

// capture the full stack, not just the message
const caught: any[] = [];
page.on('pageerror', (e: any) => caught.push({ msg: e.message, stack: e.stack }));
page.on('console', (m: any) => { if (m.type() === 'error') caught.push({ console: m.text(), loc: m.location() }); });

await page.setViewport({ width: 1600, height: 1000 });
await page.goto('https://bunonfabrics.com/admin/login', { waitUntil: 'networkidle2' });
await page.evaluate((t: string, user: any) => {
  localStorage.setItem('bunon_token', t);
  localStorage.setItem('bunon_user', JSON.stringify(user));
}, token, { id: u[0].id, name: u[0].name || u[0].username, role: u[0].role });
await page.goto('https://bunonfabrics.com/admin/inbox', { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 5000));

console.log('=== errors captured:', caught.length);
for (const c of caught) {
  console.log('---');
  console.log('msg   :', c.msg || c.console);
  if (c.loc && c.loc.url) console.log('file  :', c.loc.url + ':' + c.loc.lineNumber);
  if (c.stack) {
    const frames = String(c.stack).split('\n').slice(0, 6);
    frames.forEach((f) => console.log('   ', f.trim().slice(0, 170)));
    // pull the bundle filename out of the stack
    const m = String(c.stack).match(/https?:\/\/[^)\s]+\.js:\d+:\d+/g);
    if (m) {
      console.log('    bundles:', [...new Set(m)].slice(0, 4).join(' | '));
      for (const u2 of [...new Set(m)].slice(0, 2)) {
        const [url, line] = u2.match(/(.+):(\d+):\d+/)!.slice(1);
        const name = url.split('/').pop()!;
        const local = '/www/wwwroot/bunon.shop/dist/assets/' + name;
        if (fs.existsSync(local)) {
          const src = fs.readFileSync(local, 'utf8').split('\n');
          console.log(`    ${name} line ${line}:`);
          console.log('      ' + (src[Number(line) - 1] || '').slice(0, 300));
        }
      }
    }
  }
}

await browser.close();
process.exit(0);