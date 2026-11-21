import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { productDbPool } from '../server/db';
dotenv.config({ override: true, quiet: true as true as any });
const [u]: any = await productDbPool.query("SELECT id,phone,role,permissions FROM bunon_users WHERE role='super_admin' LIMIT 1");
let p:any=u[0].permissions; if(typeof p==='string'){try{p=JSON.parse(p)}catch{p=[]}}
const t=jwt.sign({id:u[0].id,phone:u[0].phone,role:u[0].role,permissions:p},String(process.env.JWT_SECRET),{expiresIn:'2h'});
const r = await (await fetch('http://127.0.0.1:5001/api/admin/omnichannel?limit=5',{headers:{Authorization:'Bearer '+t}})).json() as any;
const rows = r?.data?.conversations || [];
console.log('rows:', rows.length);
console.log('with avatar   :', rows.filter((x:any)=>x.avatar_url).length);
console.log('with username :', rows.filter((x:any)=>x.external_username).length);
console.log('sample:', JSON.stringify(rows.slice(0,3).map((x:any)=>({n:x.display_name,u:x.external_username,a:!!x.avatar_url}))));
process.exit(0);
