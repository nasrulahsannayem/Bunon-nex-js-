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
await pg.goto('https://bunonfabrics.com/admin/inbox?conversation=678',{waitUntil:'networkidle2',timeout:60000});
await new Promise(x=>setTimeout(x,5000));
// scroll the thread to the bottom so lazy images enter the viewport
await pg.evaluate(()=>{ const els=Array.from(document.querySelectorAll('div')).filter(d=>{const s=getComputedStyle(d);return s.overflowY==='auto'||s.overflowY==='scroll'}); els.forEach(e=>e.scrollTop=e.scrollHeight); });
await new Promise(x=>setTimeout(x,5000));
console.log(JSON.stringify(await pg.evaluate(()=>{
  const media=Array.from(document.querySelectorAll('img')) as any[];
  const w=media.filter(i=>i.src.includes('/uploads/wa/'));
  const a=Array.from(document.querySelectorAll('audio')) as any[];
  return { waImgs:w.length, waLoaded:w.filter(i=>i.naturalWidth>0).length,
    dims:w.slice(0,5).map(i=>i.naturalWidth+'x'+i.naturalHeight),
    audioTags:a.length, audioReady:a.filter(x=>x.readyState>=1).length };
}),null,1));
await pg.screenshot({path:'/tmp/wa_scrolled.png'});
await b.close(); process.exit(0);
