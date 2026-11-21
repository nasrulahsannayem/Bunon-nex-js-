/**
 * Verify Bengali rendering WITHOUT relying on a vision model: read the
 * actual DOM text and, crucially, ask the browser whether the Bengali
 * codepoints are covered by the resolved font. A tofu box is a real glyph
 * the browser cannot draw, which font loading alone would not reveal.
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

// ── 1. is a Bengali webfont actually loaded? ───────────────────────────
const fonts: any = await page.evaluate(async () => {
  await document.fonts.ready;
  const loaded = Array.from(document.fonts).map((f: any) => `${f.family} ${f.weight} ${f.status}`);
  return {
    count: document.fonts.size,
    bengali: loaded.filter((x: string) => /Hind|Siliguri|Noto.*Bengali/i.test(x)),
    latin: loaded.filter((x: string) => /Inter|Outfit/i.test(x)).slice(0, 3),
    sample: loaded.slice(0, 8),
  };
});
console.log('FONTS loaded:', fonts.count);
console.log('  Bengali faces:', fonts.bengali.length ? fonts.bengali.join(' | ') : 'NONE');
console.log('  Latin faces  :', fonts.latin.join(' | ') || 'none');

// ── 2. collect the real Bengali strings on the page ────────────────────
const text: any = await page.evaluate(() => {
  const BAN = /[\u0980-\u09FF]/;
  const out: string[] = [];
  document.querySelectorAll('button, label, h1, h2, h3, h4, span, div, p, placeholder-probe').forEach((n: any) => {
    const kids = Array.from(n.childNodes).some((c: any) => c.nodeType === 1);
    if (kids) return;                       // only leaf nodes
    const s = (n.textContent || '').trim();
    const ph = n.getAttribute?.('placeholder');
    if (BAN.test(s) && s.length < 60) out.push(s);
    if (ph && BAN.test(ph)) out.push('[ph] ' + ph);
  });
  return [...new Set(out)].slice(0, 25);
});
console.log('\nBENGALI STRINGS FOUND:', text.length);
text.forEach((t: string) => console.log('  ', t));

// ── 3. the real test: can the browser draw them? ────────────────────────
// Measure a Bengali string against a deliberately-notdef reference width.
const draw: any = await page.evaluate(() => {
  const cv = document.createElement('canvas').getContext('2d')!;
  const probe = (font: string, sample: string) => { cv.font = font; return cv.measureText(sample).width; };
  const BN = 'অপেক্ষমাণ';   // "waiting"
  const withApp = `400 32px Inter, "Hind Siliguri", "Noto Sans Bengali", sans-serif`;
  const withoutBengali = '400 32px Inter, sans-serif';
  // A string of codepoints no font covers renders at a fixed notdef width.
  const tofu = probe('400 32px sans-serif', '\u{10FFFD}'.repeat(6));
  const real = probe(withApp, BN);
  const realNoBn = probe(withoutBengali, BN);
  return {
    tofuWidth: Math.round(tofu * 100) / 100,
    bengaliWithStack: Math.round(real * 100) / 100,
    bengaliLatinOnly: Math.round(realNoBn * 100) / 100,
    // if the Bengali string measures the same as tofu, nothing drew it
    rendersAsTofu: Math.abs(real - tofu) < 0.5,
    bodyFont: getComputedStyle(document.body).fontFamily,
  };
});
console.log('\nGLYPH RENDER TEST:', JSON.stringify(draw, null, 1));

// ── 4. screenshot for the record ───────────────────────────────────────
await page.screenshot({ path: '/tmp/inbox_font_fixed.png' });
console.log('\nsaved /tmp/inbox_font_fixed.png');
await browser.close();
process.exit(0);