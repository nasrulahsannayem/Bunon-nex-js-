import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config({ override: true, quiet: true as any });

const c = await mysql.createConnection({
  host: process.env.DASH_DB_HOST || '127.0.0.1',
  user: process.env.DASH_DB_USER || 'bunonfabrics_dash_db',
  password: (process.env.DASH_DB_PASSWORD || '').trim().replace(/"/g, ''),
  database: process.env.DASH_DB_NAME || 'bunonfabrics_dash_db',
});

const [cols] = await c.query('SHOW COLUMNS FROM bf_orders');
console.log('bf_orders:', (cols as any[]).map((x) => x.Field).join(', '));
const [n] = await c.query('SELECT COUNT(*) n FROM bf_orders');
console.log('bf_orders rows:', (n as any[])[0].n);

const [t] = await c.query(
  "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME LIKE '%user%' ORDER BY TABLE_NAME"
);
console.log('user tables in dash db:', (t as any[]).map((x) => x.TABLE_NAME).join(', ') || '(none)');

const p = await mysql.createConnection({
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'bunon_shop_db',
  password: (process.env.DB_PASSWORD || '').trim().replace(/"/g, ''),
  database: process.env.DB_NAME || 'bunon_shop_db',
});
const [pu] = await p.query('SHOW COLUMNS FROM bunon_users');
console.log('bunon_users (shop db):', (pu as any[]).map((x) => `${x.Field}:${x.Type}`).join(', '));
const [pc] = await p.query('SELECT COUNT(*) n FROM bunon_users');
console.log('bunon_users rows:', (pc as any[])[0].n);

await c.end();
await p.end();