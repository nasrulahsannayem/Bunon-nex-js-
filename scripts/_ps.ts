/**
 * Instrument the real service function: print the filters it receives and the
 * final WHERE it builds. The isolated SQL reproduction returns 0 rows, so the
 * difference must be inside listConversations itself.
 */
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config({ override: true, quiet: true as true as any });

const P = '/www/wwwroot/bunon.shop/server/services/omnichannel.ts';
let s = fs.readFileSync(P, 'utf8');

// inject a probe right after the search block, before the final query
const ANCHOR = "  if (f.cursorBefore) {";
if (!s.includes('__PROBE__')) {
  s = s.replace(ANCHOR,
    `  // __PROBE__
  console.log('[PROBE] filters =', JSON.stringify(f));
  console.log('[PROBE] search truthy =', !!f.search, '| typeof =', typeof f.search);
  console.log('[PROBE] where.length =', where.length);
  console.log('[PROBE] where[last] head =', String(where[where.length - 1]).slice(0, 90).replace(/\\n/g, ' '));
  console.log('[PROBE] args.length =', args.length);
` + ANCHOR);
  fs.writeFileSync(P, s);
  console.log('probe injected');
}

const { listConversations } = await import(P);
const rows = await listConversations({ search: 'zzzznope', limit: 60 });
console.log('[RESULT] rows =', rows.length);

// remove the probe so the file is left clean
s = s.replace(/  \/\/ __PROBE__[\s\S]*?console\.log\('\[PROBE\] args\.length =', args\.length\);\n/, '');
fs.writeFileSync(P, s);
console.log('probe removed; file restored');
process.exit(0);