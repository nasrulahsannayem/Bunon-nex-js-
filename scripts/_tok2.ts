import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { productDbPool } from '../server/db';
dotenv.config({ override: true, quiet: true as true as any });
const [u]: any = await productDbPool.query("SELECT id,phone,role,permissions FROM bunon_users WHERE role='super_admin' LIMIT 1");
let p:any=u[0].permissions; if(typeof p==='string'){try{p=JSON.parse(p)}catch{p=[]}}
const good = jwt.sign({id:u[0].id,phone:u[0].phone,role:u[0].role,permissions:p},String(process.env.JWT_SECRET),{expiresIn:'2h'});
// a token signed with a DIFFERENT secret - what a stale browser token looks like
const bad = jwt.sign({id:u[0].id,phone:u[0].phone,role:u[0].role,permissions:p},'some-other-secret',{expiresIn:'2h'});
console.log('GOOD='+good);
console.log('BAD='+bad);
process.exit(0);
