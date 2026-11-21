import puppeteer from 'puppeteer-core';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { productDbPool } from '../server/db';
dotenv.config({ override: true, quiet: true as true as any });
const [u]: any = await productDbPool.query("SELECT id,phone,role,permissions,username,name FROM bunon_users WHERE role='super_admin' LIMIT 1");
let p:any=u[0].permissions; if(typeof p==='string'){try{p=JSON.parse(p)}catch{p=[]}}
const t=jwt.sign({id:u[0].id,phone:u[0].phone,role:u[0].role,permissions:p},String(process.env.JWT_SECRET),{expiresIn:'2h'});
const b=await puppeteer.launch({headless:true,executablePath:'/snap/bin/chromium',args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu','--ignore-certificate-errors']});
const pg=await b.newPage(); await pg.setViewport({width:1600,height:1000});
pg.on('response', async (r:any)=>{ if(/uploads\/wa/.test(r.url())) console.log('  RESP', r.status(), r.url().slice(-40)); });
pg.on('requestfailed', (r:any)=>{ if(/uploads\/wa/.test(r.url())) console.log('  FAILED', r.failure()?.errorText, r.url().slice(-40)); });
await pg.goto('https://bunonfabrics.com/admin/login',{waitUntil:'networkidle2'});
await pg.evaluate((tk:string,usr:any)=>{localStorage.setItem('bunon_token',tk);localStorage.setItem('bunon_user',JSON.stringify(usr))},t,{id:u[0].id,name:u[0].name||u[0].username,role:u[0].role});
await pg.goto('https://bunonfabrics.com/admin/inbox?conversation=678',{waitUntil:'networkidle2',timeout:60000});
await new Promise(x=>setTimeout(x,6000));
console.log('--- full img diagnostics ---');
console.log(JSON.stringify(await pg.evaluate(()=>{
  const imgs=Array.from(document.querySelectorAll('img')) as any[];
  return imgs.slice(0,3).map(i=>({src:i.src.slice(-42), complete:i.complete, w:i.naturalWidth, h:i.naturalHeight, currentSrc:i.currentSrc?'set':'EMPTY'}));
}),null,1));
await b.close(); process.exit(0);
