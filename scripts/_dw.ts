const BASE = 'http://127.0.0.1:5001';
const dotenv = (await import('dotenv')).default;
dotenv.config({ override: true, quiet: true as any });
const { default: jwt } = await import('jsonwebtoken');
const { productDbPool } = await import('../server/db');
const [r]: any = await productDbPool.query(
  "SELECT id, phone, role, permissions FROM bunon_users WHERE role='super_admin' LIMIT 1");
let p: any = r[0].permissions;
if (typeof p === 'string') { try { p = JSON.parse(p); } catch { p = []; } }
const T = jwt.sign({ id: r[0].id, phone: r[0].phone, role: r[0].role, permissions: p },
  String(process.env.JWT_SECRET), { expiresIn: '30d' });
const H = { Authorization: 'Bearer ' + T, 'Content-Type': 'application/json' };

const post = async (u: string, body: unknown) => {
  const r = await fetch(BASE + u, { method: 'POST', headers: H, body: JSON.stringify(body) });
  const b: any = await r.json().catch(() => ({}));
  return [r.status, b] as const;
};
const g = async (u: string) => {
  const r = await fetch(BASE + u, { headers: H });
  const b: any = await r.json().catch(() => ({}));
  return [r.status, b] as const;
};

// ── A: what does the quick-reply POST actually return? ────────────────
const [s, b] = await post('/api/admin/omnichannel/library/quick-replies',
  { title: '__probe_qr2', body: 'probe body' });
console.log('POST status:', s);
console.log('POST body:', JSON.stringify(b).slice(0, 400));

// ── B: is the row actually in the table? ──────────────────────────────
const { dbPool } = await import('../server/db');
const [rows]: any = await dbPool.query(
  "SELECT id, title, channel FROM omnichannel_quick_replies WHERE title LIKE '__probe%'");
console.log('rows in DB:', JSON.stringify(rows));

// ── C: does the service return them? ──────────────────────────────────
const wf = await import('../server/services/omnichannel_workflow');
console.log('listQuickReplies():', JSON.stringify(await wf.listQuickReplies()));
console.log('listQuickReplies("whatsapp"):', JSON.stringify(await wf.listQuickReplies('whatsapp')));

// ── D: is a snoozed row really filtered through the API? ──────────────
const [, lb]: any = await g('/api/admin/omnichannel?limit=2');
const cid = lb?.data?.conversations?.[0]?.id;
console.log('\nusing conversation id:', cid);
await post('/api/admin/omnichannel/' + cid + '/snooze', { minutes: 120 });
const [, chk]: any = await g('/api/admin/omnichannel?limit=200');
const hit = (chk?.data?.conversations || []).some((c: any) => c.id === cid);
console.log('snoozed id still in list:', hit);

// direct service call, bypassing HTTP
const oc = await import('../server/services/omnichannel');
const direct = await oc.listConversations({ limit: 200 });
console.log('direct service still returns it:', direct.some((c: any) => c.id === cid));
const [dbrow]: any = await dbPool.query(
  'SELECT id, snoozed_until, NOW() AS db_now FROM omnichannel_conversations WHERE id = ?', [cid]);
console.log('db row:', JSON.stringify(dbrow));

await post('/api/admin/omnichannel/' + cid + '/snooze', { minutes: 0 });
process.exit(0);