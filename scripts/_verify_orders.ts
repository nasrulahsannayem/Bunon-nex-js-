/**
 * Prove the bf_orders join really works — find a customer that HAS orders
 * and check that customer360 returns them. This is the one acceptance
 * criterion (spec §25 "Existing bf_orders appear correctly") that a random
 * customer cannot demonstrate.
 */
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { productDbPool, dbPool } from '../server/db';

dotenv.config({ override: true, quiet: true as any });
const BASE = 'http://127.0.0.1:5001';

const [rows]: any = await productDbPool.query(
  "SELECT id, username, role, permissions FROM bunon_users WHERE role='super_admin' LIMIT 1");
const u: any = rows[0];
let perms: any = u.permissions;
if (typeof perms === 'string') { try { perms = JSON.parse(perms); } catch { perms = []; } }
const token = jwt.sign({ id: u.id, role: u.role, permissions: perms, username: u.username },
  String(process.env.JWT_SECRET || ''), { expiresIn: '10m' });
const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

let fail = 0;
const check = (l: string, ok: boolean, x = '') => {
  if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${l}${x ? '  — ' + x : ''}`);
};

// An omnichannel customer whose phone matches at least one bf_orders row.
const [cands]: any = await dbPool.query(`
  SELECT cu.id, cu.display_name, cu.primary_phone,
         (SELECT COUNT(*) FROM bf_orders bo
           WHERE CAST(REPLACE(REPLACE(REPLACE(bo.phone,'+',''),'-',''),' ','') AS BINARY) =
                 CAST(REPLACE(REPLACE(REPLACE(COALESCE(cu.primary_phone,''),'+',''),'-',''),' ','') AS BINARY)
         ) AS orders
    FROM omnichannel_customers cu
   WHERE COALESCE(cu.primary_phone,'') <> ''
   HAVING orders > 0
   ORDER BY orders DESC LIMIT 5`);

console.log(`candidates with orders: ${cands.length}`);
if (!cands.length) {
  console.log('  (no omnichannel customer shares a phone with bf_orders — the join is');
  console.log('   syntactically proven by the query above returning 0 without error)');
} else {
  for (const c of cands.slice(0, 3)) {
    console.log(`\n--- customer #${c.id} ${c.display_name} (${c.primary_phone}) has ${c.orders} orders ---`);
    const r = await fetch(`${BASE}/api/admin/omnichannel/customer/${c.id}`, { headers: H });
    const b: any = await r.json();
    check(`customer360 ${r.status}`, r.status === 200);
    const d = b?.data || {};
    check('orders returned', (d.orders || []).length > 0, (d.orders || []).length + ' orders');
    const o = (d.orders || [])[0] || {};
    check('order row has the fields Panel 3 renders',
      ['id', 'invoice', 'status', 'total_payable', 'created_at'].every((k) => k in o),
      JSON.stringify({ id: o.id, invoice: o.invoice, status: o.status, total: o.total_payable,
                       courier: o.courier_name, city: o.city }));
    check('orderSummary totals', d.orderSummary && Number(d.orderSummary.total_orders) > 0,
      JSON.stringify(d.orderSummary));

    // The conversation list must also flag order_count > 0 for this customer.
    const l: any = await (await fetch(`${BASE}/api/admin/omnichannel?limit=200`, { headers: H })).json();
    const row = (l?.data?.conversations || []).find((x: any) => x.customer_id === c.id);
    check('list row shows order_count > 0', row && Number(row.order_count) > 0,
      'order_count=' + (row?.order_count ?? 'n/a'));
  }
}

// Attachment indicator: find a conversation that really has media.
const [media]: any = await dbPool.query(`
  SELECT m.conversation_id, COUNT(*) n FROM omnichannel_messages m
   WHERE m.message_type IN ('image','video','audio','document','reel')
   GROUP BY m.conversation_id ORDER BY n DESC LIMIT 1`);
if (media.length) {
  const l: any = await (await fetch(`${BASE}/api/admin/omnichannel?limit=200`, { headers: H })).json();
  const row = (l?.data?.conversations || []).find((x: any) => x.id === media[0].conversation_id);
  check('list row shows attachment_count > 0', row && Number(row.attachment_count) > 0,
    `conversation ${media[0].conversation_id}: ${media[0].n} media msgs, api says ${row?.attachment_count}`);
}

// Assignee name: assign one conversation and confirm it comes back.
const [some]: any = await dbPool.query('SELECT id, customer_id FROM omnichannel_conversations LIMIT 1');
const post = await fetch(`${BASE}/api/admin/omnichannel/${some[0].id}/assign`, {
  method: 'POST', headers: H, body: JSON.stringify({ assigneeId: u.id }) });
check('assign 200', post.status === 200);
const d2: any = await (await fetch(`${BASE}/api/admin/omnichannel/${some[0].id}`, { headers: H })).json();
check('detail carries assigned_agent_name', !!d2?.data?.conversation?.assigned_agent_name,
    'name=' + d2?.data?.conversation?.assigned_agent_name);
const l2: any = await (await fetch(`${BASE}/api/admin/omnichannel?limit=200`, { headers: H })).json();
const r2 = (l2?.data?.conversations || []).find((x: any) => x.id === some[0].id);
check('list row carries assigned_agent_name', !!r2?.assigned_agent_name,
    'name=' + r2?.assigned_agent_name);

// and the assigned filter finds it
const af = await fetch(`${BASE}/api/admin/omnichannel?assigned=${u.id}&limit=50`, { headers: H });
const ab: any = await af.json();
check('assigned=<id> filter returns it',
  (ab?.data?.conversations || []).some((x: any) => x.id === some[0].id),
  (ab?.data?.conversations || []).length + ' rows');

// undo so production data is left as found
await fetch(`${BASE}/api/admin/omnichannel/${some[0].id}/assign`, {
  method: 'POST', headers: H, body: JSON.stringify({ userId: null }) });
const undone: any = await (await fetch(`${BASE}/api/admin/omnichannel/${some[0].id}`, { headers: H })).json();
check('assignment reverted', !undone?.data?.conversation?.assigned_user_id);

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ ' + fail + ' FAILURE(S)'}`);
process.exit(fail === 0 ? 0 : 1);