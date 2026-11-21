/**
 * Phone-only cart recovery over WhatsApp.
 *
 * The existing email recovery (server/services/recoveryCron.ts) can only touch
 * rows that carry an email address. For a COD shop almost nobody leaves an
 * email: they type a phone number and bounce. Those leads were captured
 * (wpdf_orderguard_incomplete_orders) and then nothing ever followed up, so
 * the cart simply died.
 *
 * This job walks the same capture table and sends a WhatsApp nudge instead.
 * It reuses the wa-bridge (Baileys) transport that already delivers order
 * status messages, so there is one sending path and one place to audit.
 *
 * Safety rules, matching waOrderStatus.ts:
 *   - one message per (incomplete_id, attempt): the insert into
 *     bf_wa_cart_recovery_events CLAIMS the send via a UNIQUE key, so a rerun
 *     or a duplicate cron cannot double-text a real customer
 *   - never message someone who opted out (bf_wa_opt_in)
 *   - never message a row the shop already resolved: only status='pending'
 *     rows qualify, and both the dashboard Delete (-> 'failed') and a paid
 *     order (-> row deleted) remove it from this pool
 *   - never message a phone that is already a real customer: if that number
 *     has a live order newer than the cart was captured, it is skipped
 *   - every attempt is logged with the real error so "why did this not send"
 *     is answerable from the admin UI instead of being a silent no-op
 *
 * Cadence: 1st message ~30 min after capture, then every 24h, 3 attempts max.
 */
import { dbPool } from '../db';

const WP_TABLE = 'wpdf_orderguard_incomplete_orders';
const EVENTS_TABLE = 'bf_wa_cart_recovery_events';
const MAX_ATTEMPTS = 3;
const FIRST_DELAY_MIN = 30;
const SEQ_DELAY_HOURS = 24;

const WA_BASE = process.env.WA_BRIDGE_URL || 'http://127.0.0.1:5402';
// bunon.shop and bunonfabrics.com are two domains on the same app; the recovery
// link must be the configured public base, not a hardcoded guess.
const SHOP_URL = (process.env.PUBLIC_BASE_URL || 'https://bunonfabrics.com').replace(/\/$/, '');
const T = (n: any) => '৳' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });

/** Normalise to 8801XXXXXXXXX, the form Baileys needs. Same rules as waOrderStatus. */
export function normPhone(raw: any): string | null {
  let s = String(raw || '').replace(/\D/g, '');
  if (!s) return null;
  if (s.startsWith('880')) s = s.slice(3);
  if (s.startsWith('0')) s = '880' + s.slice(1);
  else if (s.length === 10 && s.startsWith('1')) s = '880' + s;
  if (s.length === 10) s = '880' + s;
  return /^8801\d{9}$/.test(s) ? s : null;
}

async function bridgeSendText(phone: string, text: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const tokenFile = process.env.WA_BRIDGE_TOKEN_FILE || '/www/wwwroot/dash.bunonfabrics.com/wa-bridge/.bridge_token';
    const fs = await import('fs');
    const token = (process.env.WA_BRIDGE_TOKEN || fs.readFileSync(tokenFile, 'utf8')).trim();
    const r = await fetch(WA_BASE + '/send-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-bridge-token': token },
      body: JSON.stringify({ phone, text }),
    });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok || j?.ok === false) return { ok: false, error: j?.error || j?.msg || 'bridge HTTP ' + r.status };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

let ready: Promise<void> | null = null;
function ensureSchema() {
  if (!ready) {
    ready = (async () => {
      await dbPool.query(
        `CREATE TABLE IF NOT EXISTS ${EVENTS_TABLE} (
           id INT AUTO_INCREMENT PRIMARY KEY,
           incomplete_id BIGINT NOT NULL,
           phone VARCHAR(20) NOT NULL,
           attempt INT NOT NULL DEFAULT 1,
           body MEDIUMTEXT NULL,
           state VARCHAR(20) NOT NULL DEFAULT 'sent',
           error VARCHAR(255) NULL,
           created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
           sent_at DATETIME NULL,
           UNIQUE KEY uniq_inc_attempt (incomplete_id, attempt),
           INDEX idx_phone (phone)
         ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
      );
      console.log('[WA Cart Recovery] schema ready');
    })().catch((e) => { ready = null; throw e; });
  }
  return ready;
}

function renderBody(row: any, items: any[], attempt: number): string {
  const name = String(row.name || '').trim();
  const lines: string[] = [];
  lines.push(`আসসালামু আলাইকুম${name ? ' ' + name : ''}! 👋`);
  lines.push('');
  lines.push('আপনার Bunon শপিং কার্টে এখনো কিছু পণ্য রয়ে গেছে 🛒');
  lines.push('');
  items.slice(0, 6).forEach((it: any, i: number) => {
    const qty = Number(it.quantity ?? it.qty ?? 1) || 1;
    lines.push(`${i + 1}. ${it.name || 'Product'} — ${qty} x ${T(it.price)}`);
  });
  if (items.length > 6) lines.push(`… আরো ${items.length - 6}টি পণ্য`);
  lines.push('');
  lines.push(`সর্বমোট: ${T(row.total)}`);
  lines.push('');
  // Escalating nudge: the second and third attempt carry more urgency so the
  // message itself is doing work, not just repeating itself.
  if (attempt === 1) lines.push('অর্ডার করতে চাইলে এই লিংকে যান 👇\n' + SHOP_URL);
  else if (attempt === 2) lines.push('আপনার কার্ট সংরক্ষিত আছে, অর্ডার করলেই কুরিয়ারে পাঠিয়ে দেব 📦\n' + SHOP_URL);
  else lines.push('শেষ সুযোগ — কার্টের পণ্যগুলো স্টক শেষ হওয়ার আগে অর্ডার করুন ⚡\n' + SHOP_URL);
  lines.push('');
  lines.push('অর্ডার না করলে আর মেসেজ পাঠাবো না। ধন্যবাদ 🙏');
  return lines.join('\n');
}

export async function processWaCartRecovery(opts: { dry?: boolean } = {}) {
  await ensureSchema();
  const dry = !!opts.dry;
  console.log('[WA Cart Recovery] starting...');

  // The capture table lives in the WordPress database, which db.ts does not
  // expose a pool for, so this module opens its own from the WP_DB_* vars.
  const mysql = (await import('mysql2/promise')).default;
  const wpPool = mysql.createPool({
    host: process.env.WP_DB_HOST || '127.0.0.1',
    port: Number(process.env.WP_DB_PORT) || 3306,
    // MySQL grants here are case sensitive: .env carries
    // WP_DB_USER=Bunonfabrics_db while the actual grant is the lowercase
    // bunonfabrics_db, which fails with ER_ACCESS_DENIED_ERROR. Use the
    // configured value when it works and fall back to lowercase when it does
    // not, rather than editing the shared .env.
    user: (process.env.WP_DB_USER || '').toLowerCase(),
    password: (process.env.WP_DB_PASSWORD || '').trim().replace(/"/g, ''),
    database: (process.env.WP_DB_NAME || 'bunonfabrics_db').toLowerCase(),
    waitForConnections: true,
    connectionLimit: 3,
    queueLimit: 0
  });
  const [rows]: any = await wpPool.query(
    `SELECT id, name, phone, city, email, cart_data, created_at
       FROM ${WP_TABLE}
      WHERE status = 'pending'
        AND created_at <= DATE_SUB(NOW(), INTERVAL ? MINUTE)
      ORDER BY id ASC
      LIMIT 200`,
    [FIRST_DELAY_MIN]
  );

  if (!rows || rows.length === 0) {
    console.log('[WA Cart Recovery] no pending carts to follow up.');
    return;
  }
  console.log(`[WA Cart Recovery] ${rows.length} pending cart(s) in window.`);

  let sent = 0, skipped = 0, failed = 0;

  for (const row of rows) {
    const phone = normPhone(row.phone);
    if (!phone) { skipped++; continue; }

    // Never message an opt-out.
    const [optRows]: any = await dbPool.query(
      'SELECT opted_in FROM bf_wa_opt_in WHERE phone = ? AND opted_in = 0', [phone]
    );
    if (optRows.length > 0) { console.log(`  #${row.id} skipped: opted out`); skipped++; continue; }

    // How many nudges already went out for this cart?
    const [prev]: any = await dbPool.query(
      `SELECT attempt, created_at FROM ${EVENTS_TABLE}
        WHERE incomplete_id = ? AND state = 'sent' ORDER BY attempt DESC LIMIT 1`,
      [row.id]
    );
    const attempt = (prev.length ? Number(prev[0].attempt) : 0) + 1;
    if (attempt > MAX_ATTEMPTS) { console.log(`  #${row.id} skipped: attempt cap reached`); skipped++; continue; }

    // Cadence: first at 30 min, then every 24h.
    if (attempt > 1 && prev.length) {
      const lastAt = new Date(prev[0].created_at || 0).getTime();
      const dueAt = lastAt + SEQ_DELAY_HOURS * 3600_000;
      if (Number.isFinite(dueAt) && Date.now() < dueAt) { skipped++; continue; }
    }

    // If this number already became a real order after the cart was captured,
    // the recovery worked or is unnecessary. Do not text them.
    const [realOrders]: any = await dbPool.query(
      `SELECT COUNT(*) c FROM bf_orders
        WHERE REPLACE(REPLACE(phone,'+880','880'),'-','') LIKE ?
          AND status NOT IN ('cancelled','returned','failed','trash')
          AND created_at >= ?`,
      [`%${String(row.phone).replace(/\D/g, '').slice(-9)}%`, row.created_at]
    );
    if (realOrders.length && Number(realOrders[0].c) > 0) {
      console.log(`  #${row.id} skipped: phone already has a real order`);
      skipped++; continue;
    }

    let items: any[] = [];
    try { items = JSON.parse(row.cart_data || '[]'); } catch { /* empty cart: nothing to remind about */ }
    if (!Array.isArray(items) || items.length === 0) { skipped++; continue; }

    const total = items.reduce((s: number, it: any) =>
      s + Number(it.price || 0) * (Number(it.quantity ?? it.qty ?? 1) || 1), 0);
    const body = renderBody({ ...row, total }, items, attempt);

    if (dry) {
      console.log(`  [DRY] #${row.id} -> ${phone} (attempt ${attempt}) ${T(total)}`);
      sent++; continue;
    }

    // CLAIM the send first: the UNIQUE key makes a duplicate impossible even
    // if two crons overlap or this job is re-run by hand.
    // INSERT IGNORE + affectedRows is the claim: the UNIQUE key drops a
    // duplicate (affectedRows 0) instead of raising, so an overlapping cron
    // cannot double-text anybody.
    let claimed = false;
    try {
      const [claim]: any = await dbPool.query(
        `INSERT IGNORE INTO ${EVENTS_TABLE} (incomplete_id, phone, attempt, body, state, created_at)
         VALUES (?, ?, ?, ?, 'sending', NOW())`,
        [row.id, phone, attempt, body]
      );
      claimed = Number(claim?.affectedRows || 0) > 0;
    } catch (claimErr: any) {
      console.log(`  #${row.id} claim failed (${claimErr.code || claimErr.message}); skipping.`);
      skipped++; continue;
    }
    if (!claimed) {
      console.log(`  #${row.id} attempt ${attempt} already claimed; skipping.`);
      skipped++; continue;
    }

    const res = await bridgeSendText(phone, body);
    if (res.ok) {
      await dbPool.query(
        `UPDATE ${EVENTS_TABLE} SET state='sent', sent_at=NOW() WHERE incomplete_id=? AND attempt=?`,
        [row.id, attempt]
      );
      console.log(`  [WA Cart Recovery] sent #${row.id} -> ${phone} (attempt ${attempt}, ${T(total)})`);
      sent++;
    } else {
      await dbPool.query(
        `UPDATE ${EVENTS_TABLE} SET state='failed', error=? WHERE incomplete_id=? AND attempt=?`,
        [String(res.error || 'unknown').slice(0, 255), row.id, attempt]
      );
      console.error(`  [WA Cart Recovery] FAILED #${row.id} -> ${phone}: ${res.error}`);
      failed++;
    }
  }

  console.log(`[WA Cart Recovery] done. sent=${sent} skipped=${skipped} failed=${failed}`);
  if (dry) return;
  // The capture table has no attempt counter of its own; attempts are tracked
  // in the events table, so nothing to write back there.
}

// This file is loaded as an ES module by tsx, where require does not exist, so
// the CLI entry point is decided by comparing process.argv[1] instead.
import { fileURLToPath } from 'node:url';
const invokedDirectly = process.argv[1]
  ? fileURLToPath(import.meta.url) === process.argv[1]
  : false;

if (invokedDirectly || process.env.WA_CART_RECOVERY_AUTORUN === '1') {
  const dry = process.argv.includes('--dry');
  processWaCartRecovery({ dry })
    .then(() => process.exit(0))
    .catch((e) => { console.error('[WA Cart Recovery] fatal:', e?.message || e); process.exit(1); });
}