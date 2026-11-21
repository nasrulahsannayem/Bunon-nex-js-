import mysql from 'mysql2/promise';
import fetch from 'node-fetch';

const BOT = '8584256655:AAFfAzLuwIgDd5V7uUGqNAkVQHCZdI0m73s';
const CHAT = '700926863';
const DBS = [
  { u: 'bunon_shop_db', p: '256i4NSTHpwKL6AE', d: 'bunon_shop_db' },
  { u: 'bunonfabrics_dash_db', p: 'naim#707207AA', d: 'bunonfabrics_dash_db' },
  { u: 'bunonfabrics_db', p: 'IZTvlvacRIm0EziRsw9A', d: 'bunonfabrics_db' }
];

async function send(text) {
  await fetch(`https://api.telegram.org/bot${BOT}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT, text, parse_mode: 'Markdown' })
  });
}

let found = false;
for (const cfg of DBS) {
  try {
    const conn = await mysql.createConnection({ host:'127.0.0.1', user:cfg.u, password:cfg.p, database:cfg.d, ssl:false });
    const [tables] = await conn.query('SHOW TABLES');
    const tableNames = tables.map(r => Object.values(r)[0]);
    console.log(cfg.d + ':', tableNames.join(', '));
    for (const t of tableNames) {
      if (t.toLowerCase().includes('order')) {
        try {
          const [cols] = await conn.query(`SHOW COLUMNS FROM \${t}`);
          const hasPaid = cols.some(c => c.Field === 'is_paid');
          if (hasPaid) {
            console.log('FOUND in', cfg.d + '.' + t);
            const [orders] = await conn.query(`SELECT id, invoice, customer_name, customer_phone, payment_method, total_payable FROM \${t} WHERE is_paid = 1 ORDER BY id DESC LIMIT 5`);
            for (const o of orders) {
              const msg = `✅ *Payment Received*
Order ID: ${o.id}
Invoice: ${o.invoice || 'N/A'}
Method: ${o.payment_method || 'N/A'}
Amount: ৳${o.total_payable}
Customer: ${o.customer_name || 'N/A'}
Phone: ${o.customer_phone || 'N/A'}`;
              const r = await send(msg);
              console.log('Sent order', o.id, r.ok);
            }
            found = true;
          }
        } catch(e) { console.log('Error checking', t, e.message); }
      }
    }
    await conn.end();
    if (found) break;
  } catch(e) { console.error('DB', cfg.d, 'failed:', e.message); }
}
