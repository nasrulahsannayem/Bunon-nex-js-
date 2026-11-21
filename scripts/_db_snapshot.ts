import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config({ override: true, quiet: true as any });

const c = await mysql.createConnection({
  host: process.env.DASH_DB_HOST || '127.0.0.1',
  port: Number(process.env.DASH_DB_PORT) || 3306,
  user: process.env.DASH_DB_USER || 'bunonfabrics_dash_db',
  password: (process.env.DASH_DB_PASSWORD || '').trim().replace(/"/g, ''),
  database: process.env.DASH_DB_NAME || 'bunonfabrics_dash_db',
});

const [rows] = await c.query(
  'SELECT TABLE_NAME, TABLE_ROWS FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME'
);
await c.end();

let out = `-- bunonfabrics_dash_db table/rowcount snapshot ${new Date().toISOString()}\n`;
for (const r of rows) out += `${r.TABLE_NAME}\t${r.TABLE_ROWS}\n`;
process.stdout.write(out);