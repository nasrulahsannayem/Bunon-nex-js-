/**
 * Verification for the 3-panel inbox work.
 *
 * Asserts the exact response SHAPE each panel depends on:
 *   Panel 1  list  -> agent name, attachment_count, order_count, sort order
 *   Panel 2  detail -> messages, tags, channel identities
 *   Panel 3  c360  -> identitiesByPlatform, tags, notes, orders, orderSummary,
 *                     conversation journey
 * plus every filter the UI can now send, and the RBAC/auth guards.
 */
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { productDbPool, dbPool } from '../server/db';

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
const check = (label: string, ok: boolean, extra = '') => {
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  — ' + extra : ''}`);
};
const j = async (p: string, init: any = {}) => {
  const r = await fetch(BASE + p, { ...init, headers: H });
  let b: any = null;
  try { b = await r.json(); } catch { /* non-json */ }
  return { status: r.status, body: b };
};

/* ── PANEL 1 ─────────────────────────────────────────────────────── */
console.log('\n--- PANEL 1: conversation list ---');
const list = await j('/api/admin/omnichannel?limit=60');
const convs = list.body?.data?.conversations || [];
check('list 200 + populated', list.status === 200 && convs.length > 0, convs.length + ' rows');
check('every row has last_message_at', convs.every((c: any) => c.last_message_at));
check('rows expose assigned_agent_name (spec §10)',
  convs.every((c: any) => 'assigned_agent_name' in c));
check('rows expose attachment_count (spec §10)',
  convs.every((c: any) => 'attachment_count' in c));
check('rows expose order_count (spec §10)',
  convs.every((c: any) => 'order_count' in c));
check('rows expose tags + status + priority',
  convs.every((c: any) => 'tags' in c && 'status' in c && 'priority' in c));

const first = convs[0];
console.log(`\n--- PANEL 2: thread (conversation ${first.id}) ---`);
const det = await j(`/api/admin/omnichannel/${first.id}`);
check('detail 200', det.status === 200);
const msgs = det.body?.data?.messages || [];
check('messages[] present + ascending', msgs.length > 0 && msgs.every((m: any, i: number) =>
  i === 0 || new Date(msgs[i-1].sent_at) <= new Date(m.sent_at)), msgs.length + ' msgs');
check('message has sender_type (system/ai guard, spec §15)',
  msgs.every((m: any) => 'sender_type' in m));
check('conversation has tags[] for the header', Array.isArray(det.body?.data?.conversation?.tags),
  JSON.stringify(det.body?.data?.conversation?.tags));
check('conversation has channel_identities[]', 'channel_identities' in (det.body?.data?.conversation || {}));

/* ── PANEL 3 ─────────────────────────────────────────────────────── */
console.log('\n--- PANEL 3: Customer 360 ---');
const c360 = await j(`/api/admin/omnichannel/customer/${first.customer_id}`);
check('customer360 200', c360.status === 200);
const c = c360.body?.data || {};
check('has identitiesByPlatform (fb/ig/wa)',
  c.identitiesByPlatform && 'facebook' in c.identitiesByPlatform &&
  'instagram' in c.identitiesByPlatform && 'whatsapp' in c.identitiesByPlatform);
check('has tags[]', Array.isArray(c.tags));
check('has notes[]', Array.isArray(c.notes));
check('has orders[] + orderSummary', Array.isArray(c.orders) && c.orderSummary !== undefined);
check('has conversation journey with message_count',
  Array.isArray(c.conversations) && c.conversations.every((x: any) => 'message_count' in x));
check('channelCount + totalMessages present',
  typeof c.channelCount === 'number' && typeof c.totalMessages === 'number',
  `channels=${c.channelCount} msgs=${c.totalMessages}`);

// A customer that HAS orders proves the bf_orders join really works.
if (Array.isArray(c.orders) && c.orders.length) {
  const o = c.orders[0];
  check('order rows carry what the panel renders',
    ['id', 'invoice', 'status', 'total_payable', 'created_at'].every((k) => k in o),
    JSON.stringify({ invoice: o.invoice, status: o.status, total: o.total_payable }));
  check('orderSummary totals present',
    ['total_orders', 'open_orders', 'total_due'].every((k) => k in (c.orderSummary || {})));
} else {
  console.log('  (this customer has no orders — bf_orders join not exercised here)');
}

/* ── FILTERS (spec §6) ───────────────────────────────────────────── */
console.log('\n--- FILTERS ---');
const f = async (label: string, qs: string, expect = 200) => {
  const r = await j('/api/admin/omnichannel?' + qs);
  check(label, r.status === expect, `status=${r.status} rows=${(r.body?.data?.conversations || []).length}`);
};
await f('status=open', 'status=open');
await f('status=pending', 'status=pending');
await f('status=closed', 'status=closed');
await f('priority=high', 'priority=high');
await f('platform=whatsapp', 'platform=whatsapp');
await f('platform=instagram', 'platform=instagram');
await f('platform=comments (pseudo)', 'platform=comments');
await f('platform=dm (pseudo)', 'platform=dm');
await f('mine=1', 'mine=1');
await f('unassigned=1', 'unassigned=1');
await f('assigned=1 (agent filter)', 'assigned=1');
await f('bad platform -> 400', 'platform=telepathy', 400);

/* ── SEARCH (spec §13) ───────────────────────────────────────────── */
console.log('\n--- SEARCH ---');
const tagRow: any = (await j('/api/admin/omnichannel?limit=60')).body?.data?.conversations
  ?.find((x: any) => x.tags);
if (tagRow?.tags) {
  const tg = String(tagRow.tags).split(',')[0];
  const r = await j('/api/admin/omnichannel?tag=' + encodeURIComponent(tg));
  check(`search by tag (#${tg})`, r.status === 200 &&
    (r.body?.data?.conversations || []).length > 0,
    (r.body?.data?.conversations || []).length + ' rows');
}

/* ── GUARDS ──────────────────────────────────────────────────────── */
console.log('\n--- GUARDS ---');
check('no token -> 401', (await fetch(BASE + '/api/admin/omnichannel')).status === 401);
check('missing conversation -> 404',
  (await j('/api/admin/omnichannel/88888888/read', { method: 'POST', body: '{}' })).status === 404);
const weak = jwt.sign({ id: 999999, role: 'staff', permissions: ['view_dashboard'] },
  String(process.env.JWT_SECRET || ''), { expiresIn: '5m' });
const wr = await fetch(BASE + '/api/admin/omnichannel', { headers: { Authorization: `Bearer ${weak}` } });
check('non-admin -> 403', wr.status === 403, 'status=' + wr.status);

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ ' + fail + ' FAILURE(S)'}`);
process.exit(fail === 0 ? 0 : 1);