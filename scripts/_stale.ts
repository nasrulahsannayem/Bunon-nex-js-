import puppeteer from 'puppeteer-core';
import dotenv from 'dotenv';
import { productDbPool } from '../server/db';
dotenv.config({ override: true, quiet: true as true as any });
const [u]: any = await productDbPool.query("SELECT id,phone,role,permissions FROM bunon_users WHERE role='super_admin' LIMIT 1");
let p:any=u[0].permissions; if(typeof p==='string'){try{p=JSON.parse(p)}catch{p=[]}}
const stale = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MX0.badSignatureThatIsNotValidAtAll';
const b=await puppeteer.launch({headless:true,executablePath:'/snap/bin/chromium',args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu','--ignore-certificate-errors']});
const pg=await b.newPage(); await pg.setViewport({width:1600,height:1000});
const calls:any[]=[];
pg.on('response', async (r:any)=>{ if(r.url().includes('/api/admin/omnichannel')) { let bd=''; try{bd=(await r.text()).slice(0,80)}catch{} calls.push({status:r.status(), body:bd}); } });
await pg.goto('https://bunonfabrics.com/admin/login',{waitUntil:'networkidle2'});
// plant a stale token exactly as a returning user would have it
await pg.evaluate((t:string)=>{ localStorage.setItem('bunon_token',t); localStorage.setItem('bunon_user',JSON.stringify({id:1,name:'Nasrul',role:'super_admin'})); }, stale);
await pg.goto('https://bunonfabrics.com/admin/inbox',{waitUntil:'networkidle2',timeout:60000});
await new Promise(x=>setTimeout(x,6000));
console.log('url after load:', await pg.evaluate(()=>location.pathname+location.search));
console.log('api calls:'); calls.slice(0,6).forEach(c=>console.log('  ',c.status,c.body));
console.log('page shows:', await pg.evaluate(()=>{const t=document.body.innerText; return /Failed to load|লোড করা যায়নি|অপ্রয়োজন|login/i.test(t)? t.split('\n').filter(l=>/Failed|লোড|login/i.test(l)).slice(0,3).join(' | ') : 'normal inbox';}));
await b.close(); process.exit(0);
