import puppeteer from 'puppeteer-core';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { productDbPool } from '../server/db';
dotenv.config({ override: true, quiet: true as true as any });
const [u]: any = await productDbPool.query("SELECT id,phone,role,permissions,username,name FROM bunon_users WHERE role='super_admin' LIMIT 1");
let p:any=u[0].permissions; if(typeof p==='string'){try{p=JSON.parse(p)}catch{p=[]}}
const t=jwt.sign({id:u[0].id,phone:u[0].phone,role:u[0].role,permissions:p},String(process.env.JWT_SECRET),{expiresIn:'2h'});
const b=await puppeteer.launch({headless:true,executablePath:'/snap/bin/chromium',args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu','--ignore-certificate-errors']});
const pg=await b.newPage();
pg.on('pageerror',(e:any)=>console.log('PAGEERR:',String(e.message).slice(0,120)));
pg.on('console',(m:any)=>{if(m.type()==='error')console.log('CONSERR:',m.text().slice(0,140))});
await pg.setViewport({width:1600,height:1000});
await pg.goto('https://bunonfabrics.com/admin/login',{waitUntil:'networkidle2'});
await pg.evaluate((tk:string,usr:any)=>{localStorage.setItem('bunon_token',tk);localStorage.setItem('bunon_user',JSON.stringify(usr))},t,{id:u[0].id,name:u[0].name||u[0].username,role:u[0].role});
await pg.goto('https://bunonfabrics.com/admin/inbox',{waitUntil:'networkidle2',timeout:60000});
await new Promise(r=>setTimeout(r,3500));
const beforeDlg = await pg.evaluate(()=>document.querySelectorAll('[role=dialog]').length);
const clicked = await pg.evaluate(()=>{
  const b=Array.from(document.querySelectorAll('button')).find(x=>x.getAttribute('aria-label')==='ইতিহাস');
  if(!b) return 'no button';
  b.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window}));
  return 'dispatched';
});
console.log('click:',clicked);
await new Promise(r=>setTimeout(r,2000));
console.log('dialogs before/after:',beforeDlg,'/',await pg.evaluate(()=>document.querySelectorAll('[role=dialog]').length));
console.log('aside count:',await pg.evaluate(()=>document.querySelectorAll('aside').length));
console.log('any ইতিহাস heading:',await pg.evaluate(()=>document.body.innerText.includes('এখনো কোনো পরিবর্তন')||document.body.innerText.includes('ইতিহাস')));
// check the timeline API directly
const api = await pg.evaluate(async()=>{
  const id=new URL(location.href).searchParams.get('conversation');
  const r=await fetch('/api/admin/omnichannel/'+id+'/timeline',{headers:{Authorization:'Bearer '+localStorage.getItem('bunon_token')}});
  const j=await r.json().catch(()=>({}));
  return {status:r.status, keys:Object.keys(j), n:(j?.data?.timeline||[]).length};
});
console.log('timeline API:',JSON.stringify(api));
await pg.screenshot({path:'/tmp/d3.png'});
await b.close(); process.exit(0);
