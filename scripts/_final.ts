import puppeteer from 'puppeteer-core';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { productDbPool, dbPool } from '../server/db';
dotenv.config({ override: true, quiet: true as true as any });
const [r]: any = await dbPool.query("SELECT conversation_id, COUNT(*) n FROM omnichannel_messages WHERE message_type='image' AND media_url LIKE '%/uploads/wa/%' GROUP BY conversation_id ORDER BY n DESC LIMIT 1");
const cid=r[0].conversation_id;
const [u]: any = await productDbPool.query("SELECT id,phone,role,permissions,username,name FROM bunon_users WHERE role='super_admin' LIMIT 1");
let p:any=u[0].permissions; if(typeof p==='string'){try{p=JSON.parse(p)}catch{p=[]}}
const t=jwt.sign({id:u[0].id,phone:u[0].phone,role:u[0].role,permissions:p},String(process.env.JWT_SECRET),{expiresIn:'2h'});
const b=await puppeteer.launch({headless:true,executablePath:'/snap/bin/chromium',args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu','--ignore-certificate-errors']});
const pg=await b.newPage(); await pg.setViewport({width:1600,height:1000});
await pg.goto('https://bunonfabrics.com/admin/login',{waitUntil:'networkidle2'});
await pg.evaluate((tk:string,usr:any)=>{localStorage.setItem('bunon_token',tk);localStorage.setItem('bunon_user',JSON.stringify(usr))},t,{id:u[0].id,name:u[0].name||u[0].username,role:u[0].role});
await pg.goto('https://bunonfabrics.com/admin/inbox?conversation='+cid,{waitUntil:'networkidle2',timeout:60000});
await new Promise(x=>setTimeout(x,6000));
await pg.evaluate(()=>{ Array.from(document.querySelectorAll('div')).filter(d=>getComputedStyle(d).overflowY==='auto').forEach(e=>e.scrollTop=e.scrollHeight); });
for(let i=0;i<12;i++){ await pg.evaluate(()=>{ Array.from(document.querySelectorAll('div')).filter(d=>getComputedStyle(d).overflowY==='auto').forEach(e=>e.scrollTop=e.scrollHeight); }); await new Promise(x=>setTimeout(x,1200)); }
console.log('conversation:',cid,'('+r[0].n+' images in DB)');
console.log(JSON.stringify(await pg.evaluate(()=>{
  const all=Array.from(document.querySelectorAll('img')) as any[];
  const bub=all.filter(i=>i.src.includes('image-proxy'));
  const aud=Array.from(document.querySelectorAll('audio')) as any[];
  return {
    allImgs: all.length,
    proxyImgs: bub.length,
    proxyLoaded: bub.filter(i=>i.naturalWidth>0).length,
    realSizes: bub.filter(i=>i.naturalWidth>0).slice(0,5).map(i=>i.naturalWidth+'x'+i.naturalHeight),
    audioTotal: aud.length, audioReady: aud.filter(a=>a.readyState>=1).length,
    placeholderShown: /আর পাওয়া যাচ্ছে না/.test(document.body.innerText),
  };
}),null,1));
await pg.screenshot({path:'/tmp/final_media.png'});
await b.close(); process.exit(0);
