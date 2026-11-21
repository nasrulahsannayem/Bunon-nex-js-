/**
 * Print the exact SQL and args listConversations sends, by wrapping the pool
 * query. The WHERE looks right in the probe, so the mismatch must be between
 * the template and what mysql2 actually receives.
 */
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config({ override: true, quiet: true as true as any });

const P = '/www/wwwroot/bunon.shop/server/services/omnichannel.ts';
let s = fs.readFileSync(P, 'utf8');

// wrap the one list query so we can see sql + args
const OLD = """  const limit = Math.min(Number(f.limit) || 50, 200);
  const [rows] = await dbPool.query(""";

const NEW = """  const limit = Math.min(Number(f.limit) || 50, 200);
  console.log('[SQLDBG] where.join length =', where.join(' AND ').length);
  console.log('[SQLDBG] ? in joined where  =', (where.join(' AND ').match(/\\?/g) || []).length);
  console.log('[SQLDBG] args.length         =', args.length);
  const [rows] = await dbPool.query(""";

if (!s.includes('[SQLDBG]')) {
  if (!s.includes(OLD)) { console.log('ANCHOR NOT FOUND'); process.exit(1); }
  s = s.replace(OLD, NEW);
  fs.writeFileSync(P, s);
  console.log('sql debug injected');
} else {
  console.log('already injected');
}

const { listConversations } = await import(P);
const rows = await listConversations({ search: 'zzzznope', limit: 60 });
console.log('[RESULT] rows =', rows.length);

// clean up
s = fs.readFileSync(P, 'utf8');
s = s.replace(/  console\.log\('\[SQLDBG\][^\n]*\n/g, '');
fs.writeFileSync(P, s);
console.log('debug removed');
process.exit(0);