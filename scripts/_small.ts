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
await pg.goto('https://bunonfabrics.com/admin/login',{waitUntil:'networkidle2'});
await pg.evaluate((tk:string,usr:any)=>{localStorage.setItem('bunon_token',tk);localStorage.setItem('bunon_user',JSON.stringify(usr))},t,{id:u[0].id,name:u[0].name||u[0].username,role:u[0].role});
await pg.goto('https://bunonfabrics.com/admin/inbox',{waitUntil:'networkidle2',timeout:60000});
await new Promise(r=>setTimeout(r,3500));
console.log(JSON.stringify(await pg.evaluate(()=>{
  const out:any[]=[];
  document.querySelectorAll('button,a[href]').forEach((x:any)=>{
    const r=x.getBoundingClientRect();
    if(r.width>0&&r.height>0&&(r.width<28||r.height<28)){
      out.push({w:Math.round(r.width),h:Math.round(r.height),label:x.getAttribute('aria-label')||x.getAttribute('title')||(x.textContent||'').trim().slice(0,14),cls:String(x.className).slice(0,60)});
    }
  });
  return out.slice(0,12);
}),null,1));
await b.close(); process.exit(0);
