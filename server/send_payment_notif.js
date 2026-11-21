const mysql = require('mysql2/promise');
const fetch = require('node-fetch');

(async () => {
  const db = await mysql.createConnection({
    host: '127.0.0.1',
    user: 'bunon_shop_db',
    password: '256i4NSTHpwKL6AE',
    database: 'bunon_shop_db',
    ssl: false,
    connectTimeout: 5000,
  });

  const [orders] = await db.execute(
    `SELECT id, invoice, customer_name, customer_phone, payment_method, total_payable, created_at
     FROM bf_orders
     WHERE is_paid = 1
     ORDER BY id DESC
     LIMIT 5`
  );

  console.log(`Found ${orders.length} paid orders`);

  const botToken = '8584256655:AAFfAzLuwIgDd5V7uUGqNAkVQHCZdI0m73s';
  const chatId = '700926863';

  for (const order of orders) {
    const text = `✅ *Payment Received*\nOrder ID: ${order.id}\nInvoice: ${order.invoice || 'N/A'}\nMethod: ${order.payment_method || 'N/A'}\nAmount: ৳${order.total_payable}\nCustomer: ${order.customer_name || 'N/A'}\nPhone: ${order.customer_phone || 'N/A'}`;

    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
      });
      const json = await res.json();
      console.log(json.ok ? `✓ Sent for order #${order.id}` : `✗ Failed: ${json.description}`);
    } catch (e) {
      console.error('Error sending:', e.message);
    }
  }

  await db.end();
  process.exit(0);
})();
