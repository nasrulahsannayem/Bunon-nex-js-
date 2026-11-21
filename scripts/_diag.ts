import dotenv from 'dotenv';
import { getSecret } from '../server/utils/secrets';
dotenv.config({ override: true, quiet: true as true as any });
const t = await getSecret('meta_access_token');
const r: any = await (await fetch('https://graph.facebook.com/v21.0/me?fields=id,name&access_token='+encodeURIComponent(t))).json();
console.log('token identity:', JSON.stringify(r));
// ask for a name+username only (no picture) on a personal-scoped id
for (const id of ['1292159553987057','24705504972420660']) {
  const u='https://graph.facebook.com/v21.0/'+id+'?fields=name,username&access_token='+encodeURIComponent(t);
  console.log(id+':', JSON.stringify(await (await fetch(u)).json()).slice(0,220));
}
process.exit(0);
