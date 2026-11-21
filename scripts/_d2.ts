import puppeteer from 'puppeteer-core';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { productDbPool } from '../server/db';
dotenv.config({ override: true, quiet: true as true as any });
const [u]: any = await productDbPool.query("SELECT id,phone,role,permissions,username,name FROM bunon_users WHERE role='super_admin' LIMIT 1");
let p: any = u[0].permissions; if(typeof p==='string'){try{p=JSON.parse(p)}catch{p=[]}}
const t = jwt.sign({id:u[0].id,phone:u[0].phone,role:u[0].role,permissions:p},String(process.env.JWT_SECRET),{expiresIn:'2h'});
const b = await puppeteer.launch({headless:true,executablePath:'/snap/bin/chromium',args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu','--ignore-certificate-errors']});
const pg = await b.newPage();
await pg.setViewport({width:1600,height:1000});
await pg.goto('https://bunonfabrics.com/admin/login',{waitUntil:'networkidle2'});
await pg.evaluate((tk:string,usr:any)=>{localStorage.setItem('bunon_token',tk);localStorage.setItem('bunon_user',JSON.stringify(usr))},t,{id:u[0].id,name:u[0].name||u[0].username,role:u[0].role});
await pg.goto('https://bunonfabrics.com/admin/inbox',{waitUntil:'networkidle2',timeout:60000});
await new Promise(r=>setTimeout(r,3500));
// print EXACT label bytes for the two suspects
const info: any = await pg.evaluate(()=>{
  const bs:any[]=[];
  document.querySelectorAll('button').forEach((x:any)=>{
    const l=x.getAttribute('aria-label'), ti=x.getAttribute('title');
    if(l&&/ইতিহাস|দ্রুত/.test(l)) bs.push({l, lc:[...l].map(c=>c.codePointAt(0)), ti});
    if(ti&&/ইতিহাস|দ্রুত/.test(ti)) bs.push({ti, tc:[...ti].map(c=>c.codePointAt(0)), l});
  });
  return bs;
});
console.log('exact match data:', JSON.stringify(info,null,1));
// try clicking by index directly
const clicked: any = await pg.evaluate(()=>{
  const target = Array.from(document.querySelectorAll('button')).find(x=>x.getAttribute('title')==='ইতিহাস');
  if(!target) return 'NOT FOUND';
  target.click(); return 'CLICKED';
});
console.log('history click:', clicked);
await new Promise(r=>setTimeout(r,1200));
console.log('dialog present:', await pg.evaluate(()=>!!document.querySelector('[role=dialog]')));
await b.close(); process.exit(0);
