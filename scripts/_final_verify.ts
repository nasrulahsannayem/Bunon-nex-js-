/**
 * Final verification: exercise every route the Inbox UI actually calls,
 * with a real admin token, and assert the SHAPE the UI depends on.
 */
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { productDbPool } from '../server/db';

dotenv.config({ override: true, quiet: true as any });
const BASE = 'http://127.0.0.1:5001';

const [rows]: any = await productDbPool.query(
  "SELECT id, username, role, permissions FROM bunon_users WHERE role='super_admin' LIMIT 1"
);
const u: any = rows[0];
let perms: any = u.permissions;
if (typeof perms === 'string') { try { perms = JSON.parse(perms); } catch { perms = []; } }
const token = jwt.sign(
  { id: u.id, role: u.role, permissions: perms, username: u.username },
  String(process.env.JWT_SECRET || ''), { expiresIn: '10m' }
);
const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

let fail = 0;
const check = (label: string, cond: boolean, extra = '') => {
  if (!cond) fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  — ' + extra : ''}`);
};

const j = async (p: string, init: any = {}) => {
  const r = await fetch(BASE + p, { ...init, headers: H });
  let b: any = null;
  try { b = await r.json(); } catch { /* non-json */ }
  return { status: r.status, body: b };
};

/* 1. OmniBubble: stats + list(limit=8) + list(platform=whatsapp) */
const st = await j('/api/admin/omnichannel/stats');
check('bubble stats 200', st.status === 200);
check('stats has channels[]', Array.isArray(st.body?.data?.channels));
check('stats channels carry platform+unread',
  (st.body?.data?.channels || []).every((c: any) => c.platform && 'unread' in c),
  JSON.stringify(st.body?.data?.channels));
check('stats counts object', typeof st.body?.data?.counts?.total === 'number',
  'total=' + st.body?.data?.counts?.total);

const l1 = await j('/api/admin/omnichannel?limit=8');
const convs = l1.body?.data?.conversations || [];
check('bubble list 200 + non-empty', l1.status === 200 && convs.length > 0, convs.length + ' rows');
check('every row has id+platform+last_message_at',
  convs.every((c: any) => c.id && c.platform && c.last_message_at),
  'sample last_message_at=' + convs[0]?.last_message_at);
check('rows sorted newest-first',
  convs.every((c: any, i: number) => i === 0 ||
    new Date(convs[i-1].last_message_at) >= new Date(c.last_message_at)));
check('preview present', convs.every((c: any) => 'last_message_preview' in c));

const l2 = await j('/api/admin/omnichannel?limit=8&platform=whatsapp');
check('platform filter works',
  (l2.body?.data?.conversations || []).every((c: any) => c.platform === 'whatsapp'));

/* 2. InboxPage: detail + messages + customer360 */
const first = convs[0];
const det = await j(`/api/admin/omnichannel/${first.id}`);
check('detail 200', det.status === 200);
check('detail has messages[]', Array.isArray(det.body?.data?.messages),
  (det.body?.data?.messages || []).length + ' msgs');
check('messages sorted asc', (() => {
  const m = det.body?.data?.messages || [];
  return m.every((x: any, i: number) => i === 0 ||
    new Date(m[i-1].sent_at) <= new Date(x.sent_at));
})());
check('message has body+direction+type',
  (det.body?.data?.messages || []).every((m: any) =>
    'body' in m && 'direction' in m && 'message_type' in m));

const c360 = await j(`/api/admin/omnichannel/customer/${first.customer_id}`);
check('customer360 200', c360.status === 200);
check('customer360 has identities+conversations+orders',
  Array.isArray(c360.body?.data?.identities) &&
  Array.isArray(c360.body?.data?.conversations) &&
  Array.isArray(c360.body?.data?.orders));

/* 3. Channel health (the UI's capability banner) */
const hp = await j('/api/admin/omnichannel/channels/health');
check('channel health 200', hp.status === 200);
check('health lists all 3 live platforms',
  ['facebook', 'instagram', 'whatsapp']
    .every((p) => (hp.body?.data?.channels || []).some((c: any) => c.platform === p)));

/* 4. Validation guards */
check('unknown platform -> 400', (await j('/api/admin/omnichannel?platform=xyz')).status === 400);
check('bad id -> 400', (await j('/api/admin/omnichannel/xx/read', { method: 'POST', body: '{}' })).status === 400);
check('missing conv -> 404', (await j('/api/admin/omnichannel/88888888/read', { method: 'POST', body: '{}' })).status === 404);
check('no token -> 401', (await fetch(BASE + '/api/admin/omnichannel')).status === 401);

/* 5. Mutating round-trip, then undo */
await j(`/api/admin/omnichannel/${first.id}/priority`, { method: 'POST', body: JSON.stringify({ priority: 'high' }) });
const afterP = await j(`/api/admin/omnichannel/${first.id}`);
check('priority persisted', afterP.body?.data?.conversation?.priority === 'high');
await j(`/api/admin/omnichannel/${first.id}/priority`, { method: 'POST', body: JSON.stringify({ priority: 'normal' }) });

await j(`/api/admin/omnichannel/${first.id}/tags`, { method: 'POST', body: JSON.stringify({ tag: 'e2e', add: true }) });
const afterT = await j(`/api/admin/omnichannel/${first.id}`);
const tags = afterT.body?.data?.conversation?.tags;
check('tag add works', Array.isArray(tags) && tags.some((t: any) =>
  (typeof t === 'string' ? t : t.tag) === 'e2e'), 'tags=' + JSON.stringify(tags));
await j(`/api/admin/omnichannel/${first.id}/tags`, { method: 'POST', body: JSON.stringify({ tag: 'e2e', add: false }) });
const afterT2 = await j(`/api/admin/omnichannel/${first.id}`);
const tags2 = afterT2.body?.data?.conversation?.tags || [];
check('tag remove works', !tags2.some((t: any) => (typeof t === 'string' ? t : t.tag) === 'e2e'),
  'tags=' + JSON.stringify(tags2));

const noteRes = await j(`/api/admin/omnichannel/${first.id}/note`, {
  method: 'POST', body: JSON.stringify({ body: 'e2e verification note' })
});
check('internal note 201', noteRes.status === 201 || noteRes.status === 200,
  'status=' + noteRes.status);

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ ' + fail + ' FAILURE(S)'}  (${20 - fail}/20 checks)`);
process.exit(fail === 0 ? 0 : 1);