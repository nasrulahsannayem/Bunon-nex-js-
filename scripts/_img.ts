import puppeteer from 'puppeteer-core';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { productDbPool, dbPool } from '../server/db';
dotenv.config({ override: true, quiet: true as true as any });
// find the conversation with the most images
const [r]: any = await dbPool.query("SELECT conversation_id, COUNT(*) n FROM omnichannel_messages WHERE message_type='image' AND media_url IS NOT NULL GROUP BY conversation_id ORDER BY n DESC LIMIT 1");
const cid = r[0].conversation_id;
console.log('conversation with most images:', cid, '(' + r[0].n + ' images)');
const [u]: any = await productDbPool.query("SELECT id,phone,role,permissions,username,name FROM bunon_users WHERE role='super_admin' LIMIT 1");
let p:any=u[0].permissions; if(typeof p==='string'){try{p=JSON.parse(p)}catch{p=[]}}
const t=jwt.sign({id:u[0].id,phone:u[0].phone,role:u[0].role,permissions:p},String(process.env.JWT_SECRET),{expiresIn:'2h'});
const b=await puppeteer.launch({headless:true,executablePath:'/snap/bin/chromium',args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu','--ignore-certificate-errors']});
const pg=await b.newPage(); await pg.setViewport({width:1600,height:1000});
await pg.goto('https://bunonfabrics.com/admin/login',{waitUntil:'networkidle2'});
await pg.evaluate((tk:string,usr:any)=>{localStorage.setItem('bunon_token',tk);localStorage.setItem('bunon_user',JSON.stringify(usr))},t,{id:u[0].id,name:u[0].name||u[0].username,role:u[0].role});
await pg.goto('https://bunonfabrics.com/admin/inbox?conversation='+cid,{waitUntil:'networkidle2',timeout:60000});
await new Promise(x=>setTimeout(x,5000));
console.log(JSON.stringify(await pg.evaluate(()=>{
  const imgs=Array.from(document.querySelectorAll('img[src*=fbcdn],img[src*=uploads]'));
  return {
    mediaImgs: imgs.length,
    loaded: imgs.filter((i:any)=>i.naturalWidth>0).length,
    broken: imgs.filter((i:any)=>i.complete&&i.naturalWidth===0).length,
    sampleSrc: imgs[0]?.src?.slice(0,70)||null,
    dims: imgs.slice(0,3).map((i:any)=>i.naturalWidth+'x'+i.naturalHeight),
    stillShowsTypeWord: /\bimage\b/i.test(document.body.innerText),
  };
}),null,1));
await pg.screenshot({path:'/tmp/media_test.png'});
await b.close(); process.exit(0);
