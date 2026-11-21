import puppeteer from 'puppeteer-core';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { productDbPool, dbPool } from '../server/db';
dotenv.config({ override: true, quiet: true as true as any });
const [r]: any = await dbPool.query("SELECT conversation_id, COUNT(*) n FROM omnichannel_messages WHERE message_type='image' AND media_url LIKE '%/uploads/wa/%' GROUP BY conversation_id ORDER BY n DESC LIMIT 1");
const cid = r[0].conversation_id;
console.log('WA image conversation:', cid, '(' + r[0].n + ')');
const [u]: any = await productDbPool.query("SELECT id,phone,role,permissions,username,name FROM bunon_users WHERE role='super_admin' LIMIT 1");
let p:any=u[0].permissions; if(typeof p==='string'){try{p=JSON.parse(p)}catch{p=[]}}
const t=jwt.sign({id:u[0].id,phone:u[0].phone,role:u[0].role,permissions:p},String(process.env.JWT_SECRET),{expiresIn:'2h'});
const b=await puppeteer.launch({headless:true,executablePath:'/snap/bin/chromium',args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu','--ignore-certificate-errors']});
const pg=await b.newPage(); await pg.setViewport({width:1600,height:1000});
await pg.goto('https://bunonfabrics.com/admin/login',{waitUntil:'networkidle2'});
await pg.evaluate((tk:string,usr:any)=>{localStorage.setItem('bunon_token',tk);localStorage.setItem('bunon_user',JSON.stringify(usr))},t,{id:u[0].id,name:u[0].name||u[0].username,role:u[0].role});
await pg.goto('https://bunonfabrics.com/admin/inbox?conversation='+cid,{waitUntil:'networkidle2',timeout:60000});
await new Promise(x=>setTimeout(x,6000));
console.log(JSON.stringify(await pg.evaluate(()=>{
  const imgs=Array.from(document.querySelectorAll('img')) as any[];
  const media=imgs.filter(i=>i.src.includes('/uploads/wa/')||i.src.includes('fbcdn'));
  return { total: imgs.length, mediaImgs: media.length,
    loaded: media.filter(i=>i.naturalWidth>0).length,
    dims: media.slice(0,4).map(i=>i.naturalWidth+'x'+i.naturalHeight),
    placeholderShown: /আর পাওয়া যাচ্ছে না/.test(document.body.innerText) };
}),null,1));
await pg.screenshot({path:'/tmp/wa_img.png'});
await b.close(); process.exit(0);
