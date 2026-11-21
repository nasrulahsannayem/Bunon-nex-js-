/**
 * Verify the stale-session fix end to end.
 * Mints its own token in-process (no helper file needed).
 */
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { spawnSync } from 'child_process';
import { productDbPool } from '../server/db';

dotenv.config({ override: true, quiet: true as any });
const SITE = 'https://bunonfabrics.com';

let fail = 0;
const check = (label: string, ok: boolean, extra = '') => {
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  — ' + extra : ''}`);
};

const [rows]: any = await productDbPool.query(
  "SELECT id, username, role, permissions FROM bunon_users WHERE role='super_admin' LIMIT 1"
);
const u: any = rows[0];
let perms: any = u.permissions;
if (typeof perms === 'string') { try { perms = JSON.parse(perms); } catch { perms = []; } }
const good = jwt.sign(
  { id: u.id, role: u.role, permissions: perms, username: u.username },
  String(process.env.JWT_SECRET || ''), { expiresIn: '10m' }
);
check('minted a valid admin token', good.length > 100, good.length + ' chars');

const dead = await fetch(`${SITE}/api/admin/me`, {
  headers: { Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.dead.dead' },
});
check('dead token -> 401 on /api/admin/me', dead.status === 401, 'status=' + dead.status);

const okRes = await fetch(`${SITE}/api/admin/me`, {
  headers: { Authorization: `Bearer ${good}` },
});
check('good token -> 200 on /api/admin/me', okRes.status === 200, 'status=' + okRes.status);

check('no token -> 401', (await fetch(`${SITE}/api/admin/me`)).status === 401);

// The client guard is minified, so assert on the SOURCE of the shipped app,
// and separately confirm the built HTML/JS actually loads.
const src = spawnSync('bash', ['-lc',
  "cd /www/wwwroot/bunon.shop && cat src/utils/session.ts src/pages/admin/AdminLayout.tsx src/pages/admin/AdminLogin.tsx"],
  { encoding: 'utf8' }).stdout || '';

check('session.ts helper ships the /api/admin/me probe', /\/api\/admin\/me/.test(src));
check('layout guard clears bunon_token',
  /removeItem\(['"]bunon_token['"]\)/.test(src));
check('layout guard redirects with expired=1', /expired=1/.test(src));
check('login shows a Bengali expiry notice', /সেশনের মেয়াদ শেষ হয়েছে/.test(src));
check('adminFetch exists in the shared helper', /export async function adminFetch/.test(src));
check('adminFetch clears the session on a dead token',
  /expireAdminSession\(\)/.test(src));

// And the deployed bundle must reference the helper (minified names differ,
// so look for the endpoint string, which survives minification).
const assets = (spawnSync('bash', ['-lc',
  "cd /www/wwwroot/bunon.shop && grep -l 'admin/me' dist/assets/*.js"], { encoding: 'utf8' }).stdout || '').trim();
check('built bundle probes /api/admin/me', assets.split('\n').filter(Boolean).length > 0, assets.split('\n')[0] || '(none)');

const shell = await (await fetch(`${SITE}/admin/login?expired=1`)).text();
check('/admin/login?expired=1 serves the app shell', shell.includes('/assets/index-'));

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ ' + fail + ' FAILURE(S)'}`);
process.exit(fail === 0 ? 0 : 1);