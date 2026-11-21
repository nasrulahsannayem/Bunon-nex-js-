/**
 * Decisive test: does the browser actually DRAW the Bengali glyphs, or are we
 * still seeing tofu boxes?
 *
 * Written as a string because tsx/esbuild injects a __name helper that
 * breaks when a function containing arrow functions is passed into
 * page.evaluate directly.
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

const PROBE = `(async () => {
  await document.fonts.ready;
  const cv = document.createElement('canvas').getContext('2d');
  const w = (font, s) => { cv.font = font; return cv.measureText(s).width; };
  const BN = 'অপেক্ষমাণ';
  // Codepoints in Plane 15/16 private area are in no font: this is the tofu width.
  const TOFU = String.fromCodePoint(0x10FFFD).repeat(6);
  const appStack = '400 32px Inter, "Hind Siliguri", "Noto Sans Bengali", sans-serif';
  const latinOnly = '400 32px Inter, sans-serif';
  const tofuW = w('400 32px sans-serif', TOFU);
  const withBn = w(appStack, BN);
  const noBn = w(latinOnly, BN);
  return {
    tofuWidth: Math.round(tofuW * 10) / 10,
    bengali_with_stack: Math.round(withBn * 10) / 10,
    bengali_latin_only: Math.round(noBn * 10) / 10,
    renders_as_tofu: Math.abs(withBn - tofuW) < 1,
    differs_from_latin_only: Math.abs(withBn - noBn) > 1,
    bodyFont: getComputedStyle(document.body).fontFamily,
    hindLoaded: Array.from(document.fonts).some(f => /Hind Siliguri/.test(f.family) && f.status === 'loaded'),
  };
})()`;

const r: any = await page.evaluate(PROBE);
console.log(JSON.stringify(r, null, 1));

if (r.renders_as_tofu) console.log('\nSTILL TOFU — the Bengali face is not covering those codepoints');
else console.log('\nBengali glyphs render correctly (width differs from the tofu box)');
if (!r.hindLoaded) console.log('WARNING: Hind Siliguri reports not loaded');

await page.screenshot({ path: '/tmp/inbox_font_fixed.png' });
console.log('saved /tmp/inbox_font_fixed.png');
await browser.close();
process.exit(0);