import "dotenv/config";
import mysql from "mysql2/promise";

const BOT = process.env.PAYMENT_BOT_TOKEN;
const CHAT = process.env.PAYMENT_NOTIFY_CHAT_ID || "700926863";

if (!BOT) { console.error("No PAYMENT_BOT_TOKEN"); process.exit(1); }

async function sendMsg(text) {
  const res = await fetch(`https://api.telegram.org/bot${BOT}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT, text, parse_mode: "Markdown" })
  });
  return res.json();
}

const db = await mysql.createConnection({
  host: process.env.DASH_DB_HOST || "127.0.0.1",
  user: process.env.DASH_DB_USER,
  password: (process.env.DASH_DB_PASSWORD || "").trim().replace(/\"/g, ""),
  database: process.env.DASH_DB_NAME || "bunonfabrics_dash_db",
  ssl: false
});

const [rows] = await db.query(
  "SELECT id, invoice, customer_name, phone, payment_method, total_payable, created_at FROM bf_orders WHERE is_paid = 1 ORDER BY id DESC LIMIT 5"
);

console.log("Found " + rows.length + " paid orders");

for (const o of rows) {
  const dateStr = new Date(o.created_at).toLocaleString("en-BD", { timeZone: "Asia/Dhaka" });
  const msg =
    "✅ *Payment Received*\n" +
    `Order: #${o.id}\nInvoice: ${o.invoice || "N/A"}\nMethod: ${o.payment_method || "N/A"}\nAmount: ৳${o.total_payable}\nCustomer: ${o.customer_name || "N/A"}\nPhone: ${o.phone || "N/A"}\nDate: ${dateStr}`;

  try {
    const r = await sendMsg(msg);
    console.log(r.ok ? "SENT order #" + o.id : "FAIL: " + r.description);
  } catch(e) { console.error("ERR #" + o.id + ": " + e.message); }
}

await db.end();
console.log("Done.");
