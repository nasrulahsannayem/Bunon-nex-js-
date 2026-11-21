import { displayNameFor } from '../src/utils/displayName';
const x = { display_name:'8801939877283', primary_phone:'8801939877283', platform:'whatsapp' };
console.log('input :', JSON.stringify(x));
console.log('output:', displayNameFor(x));
const y = { display_name:'289432522086', primary_phone:null, platform:'facebook' };
console.log('fb    :', displayNameFor(y));
process.exit(0);
