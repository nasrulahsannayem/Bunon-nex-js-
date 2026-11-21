import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { productDbPool, dbPool } from '../server/db';
dotenv.config({ override: true, quiet: true as true as any });
const [u]: any = await productDbPool.query("SELECT id,phone,role,permissions FROM bunon_users WHERE role='super_admin' LIMIT 1");
let p:any=u[0].permissions; if(typeof p==='string'){try{p=JSON.parse(p)}catch{p=[]}}
const t=jwt.sign({id:u[0].id,phone:u[0].phone,role:u[0].role,permissions:p},String(process.env.JWT_SECRET),{expiresIn:'2h'});
const H = { Authorization: 'Bearer '+t };
const base='https://bunonfabrics.com';
const g=async(u:string)=>{const r=await fetch(base+u,{headers:H}); const j:any=await r.json(); return {status:r.status, n:(j?.data?.conversations||[]).length, err:j?.error?.message};};
console.log('no filter      :', JSON.stringify(await g('/api/admin/omnichannel?limit=60')));
console.log('search=772732  :', JSON.stringify(await g('/api/admin/omnichannel?search=772732&limit=60')));
console.log('search=8801    :', JSON.stringify(await g('/api/admin/omnichannel?search=8801&limit=60')));
console.log('search=zzz     :', JSON.stringify(await g('/api/admin/omnichannel?search=zzzznope&limit=60')));
// direct service call to surface the raw SQL error
const svc = await import('../server/services/omnichannel');
try {
  const r: any = await (svc as any).listConversations({ search: '8801', limit: 60 });
  console.log('service direct  : rows=', (r?.conversations||r||[]).length);
} catch (e: any) { console.log('service THREW   :', String(e.message).slice(0,200)); }
process.exit(0);
