import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { productDbPool } from '../server/db';
dotenv.config({ override: true, quiet: true as true as any });
const [u]: any = await productDbPool.query("SELECT id,phone,role,permissions FROM bunon_users WHERE role='super_admin' LIMIT 1");
let p:any=u[0].permissions; if(typeof p==='string'){try{p=JSON.parse(p)}catch{p=[]}}
const t=jwt.sign({id:u[0].id,phone:u[0].phone,role:u[0].role,permissions:p},String(process.env.JWT_SECRET),{expiresIn:'2h'});
const r: any = await (await fetch('http://127.0.0.1:5001/api/admin/omnichannel?platform=whatsapp&limit=2',{headers:{Authorization:'Bearer '+t}})).json();
const rows=r?.data?.conversations||[];
console.log('keys on a row:', Object.keys(rows[0]||{}).join(', '));
console.log('phone field :', JSON.stringify({primary_phone:rows[0]?.primary_phone, display_name:rows[0]?.display_name}));
process.exit(0);
