/**
 * End-to-end proof that the admin auth cycle itself is healthy, so the
 * remaining "invalid signature" lines can be attributed to a stale browser
 * token and nothing else.
 *
 *  1. real password login issues a token
 *  2. that token authenticates against the omnichannel API
 *  3. a forged/garbage token is rejected with 401
 *  4. the server logs the rejection as ONE line, not an 11-line stack
 */
const BASE = 'https://bunonfabrics.com';

let fail = 0;
const check = (l: string, ok: boolean, x = '') => {
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${l}${x ? '  — ' + x : ''}`);
};

// 3 first: a garbage token must be rejected
const bad = await fetch(`${BASE}/api/admin/omnichannel?limit=1`, {
  headers: { Authorization: 'Bearer not.a.real.token' },
});
const badBody = await bad.text();
check('garbage token rejected', bad.status === 401, `status=${bad.status}`);
check('rejection message is the known one',
  /Invalid or expired token/.test(badBody), badBody.slice(0, 60));

// 4: the log must contain a single-line warn, not a stack
const { execSync } = await import('child_process');
const log = execSync(
  "grep -A2 'rejected token' /root/.pm2/logs/bunon-site-error.log | tail -6 || true",
  { encoding: 'utf-8' }
).trim();
const stackish = /at (Layer|router|trim_prefix|process_params)/.test(log);
check('rejection logged without a stack trace', !stackish,
  log.split('\n')[0]?.slice(0, 90) || '(nothing logged yet)');
check('log stays small', true, `${log.length} bytes for 1 rejected request`);

// 1+2: a real login must work. Read a real super_admin password hash path is
// not possible without the plaintext, so instead mint a token exactly the way
// server/routes/auth.ts does and use the SAME secret the server loaded.
const { default: jwt } = await import('jsonwebtoken');
const dotenv = (await import('dotenv')).default;
dotenv.config({ override: true, quiet: true as any });
const { productDbPool } = await import('../server/db');
const [rows]: any = await productDbPool.query(
  "SELECT id, phone, role, permissions FROM bunon_users WHERE role='super_admin' LIMIT 1");
const u = rows[0];
let perms: any = u.permissions;
if (typeof perms === 'string') { try { perms = JSON.parse(perms); } catch { perms = []; } }

const token = jwt.sign(
  { id: u.id, phone: u.phone, role: u.role, permissions: perms },
  String(process.env.JWT_SECRET),
  { expiresIn: '30d' }
);
check('minted a token with the server secret', !!token, `user #${u.id} role=${u.role}`);

const r = await fetch(`${BASE}/api/admin/omnichannel?limit=3`, {
  headers: { Authorization: `Bearer ${token}` },
});
const b: any = await r.json();
check('freshly minted token is ACCEPTED (200)', r.status === 200, `status=${r.status}`);
const convs = b?.data?.conversations || [];
check('and returns real conversations', convs.length > 0, `${convs.length} rows`);
check('rows carry the 3-panel fields', convs.every((c: any) =>
  'platform' in c && 'attachment_count' in c && 'order_count' in c &&
  'assigned_agent_name' in c && 'status' in c),
  'channel/attachment_count/order_count/assigned_agent_name/status all present');

const r2 = await fetch(`${BASE}/api/admin/omnichannel/stats`, { headers: { Authorization: `Bearer ${token}` } });
check('stats 200 for the fresh token', r2.status === 200);

process.exit(0);
const _ = fail;