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

let fail = 0;
const ck = (l: string, ok: boolean, x = '') => {
  if (!ok) fail++;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + l + (x ? '  — ' + x : ''));
};
const g = async (u: string) => {
  const r = await fetch(BASE + u, { headers: H });
  const b: any = await r.json().catch(() => ({}));
  return [r.status, b] as const;
};
const post = async (u: string, body: unknown) => {
  const r = await fetch(BASE + u, { method: 'POST', headers: H, body: JSON.stringify(body) });
  const b: any = await r.json().catch(() => ({}));
  return [r.status, b] as const;
};

const [ls, lst] = await g('/api/admin/omnichannel?limit=2');
ck('list still works', ls === 200, (lst?.data?.conversations || []).length + ' rows');
const cid = (lst?.data?.conversations || []).find((c: any) => c.id)?.id;
ck('got a conversation id', !!cid, 'id=' + cid);

let [s, b] = await g('/api/admin/omnichannel/views/all');
ck('GET /views/all not shadowed by /:id', s === 200 && Array.isArray(b?.data?.views), 'status=' + s);
[s, b] = await g('/api/admin/omnichannel/library/all');
ck('GET /library/all', s === 200 && Array.isArray(b?.data?.quickReplies),
  'quickReplies=' + (b?.data?.quickReplies || []).length);
[s, b] = await g('/api/admin/omnichannel/' + cid + '/sla');
ck('GET /:id/sla', s === 200, 'sla=' + JSON.stringify(b?.data?.sla));
[s, b] = await g('/api/admin/omnichannel/' + cid + '/timeline');
ck('GET /:id/timeline', s === 200 && Array.isArray(b?.data?.timeline),
  'events=' + (b?.data?.timeline || []).length);

[s, b] = await post('/api/admin/omnichannel/' + cid + '/snooze', { minutes: 30 });
ck('POST snooze 30m', s === 200 && !!b?.data?.snoozedUntil, 'until=' + b?.data?.snoozedUntil);
[s, b] = await post('/api/admin/omnichannel/' + cid + '/snooze', { minutes: 0 });
ck('POST snooze 0 wakes it', s === 200 && b?.data?.snoozedUntil === null);

[s, b] = await post('/api/admin/omnichannel/views/save',
  { name: '__probe_view', query: { status: 'open' } });
ck('POST views/save', s === 200 && (b?.data?.views || []).some((v: any) => v.name === '__probe_view'));
const vid = (b?.data?.views || []).find((v: any) => v.name === '__probe_view')?.id;
const dr = await fetch(BASE + '/api/admin/omnichannel/views/' + vid, { method: 'DELETE', headers: H });
ck('DELETE views/:id', dr.status === 200);
[s, b] = await g('/api/admin/omnichannel/views/all');
ck('probe view removed', !(b?.data?.views || []).some((v: any) => v.name === '__probe_view'));

[s, b] = await post('/api/admin/omnichannel/library/quick-replies',
  { title: '__probe_qr', body: 'test body' });
ck('POST quick-replies', s === 200 &&
  (b?.data?.quickReplies || []).some((q: any) => q.title === '__probe_qr'));
const qid = (b?.data?.quickReplies || []).find((q: any) => q.title === '__probe_qr')?.id;
await fetch(BASE + '/api/admin/omnichannel/library/quick-replies/' + qid, { method: 'DELETE', headers: H });
[s, b] = await g('/api/admin/omnichannel/library/all');
ck('probe quick reply removed',
  !(b?.data?.quickReplies || []).some((q: any) => q.title === '__probe_qr'));

// snooze must actually hide the row from the default list
[s, b] = await post('/api/admin/omnichannel/' + cid + '/snooze', { minutes: 60 });
const snoozed = await g('/api/admin/omnichannel?limit=200');
const hidden = !(snoozed[1]?.data?.conversations || []).some((c: any) => c.id === cid);
ck('snoozed conversation is hidden from the list', hidden, 'hidden=' + hidden);
await post('/api/admin/omnichannel/' + cid + '/snooze', { minutes: 0 });

console.log(fail === 0 ? '\nALL PASS' : '\n' + fail + ' FAILURE(S)');
process.exit(fail === 0 ? 0 : 1);