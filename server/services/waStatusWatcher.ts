/**
 * Order-status watcher.
 *
 * Every place that moves an order between statuses — an admin clicking Confirm,
 * the courier sync setting in_transit, a manual edit, a future webhook — is a
 * separate line of code, and patching each one with a "notify the customer"
 * call is how updates get silently skipped. Instead this polls the orders table
 * and sends for any status it has not announced yet.
 *
 * It reuses the same claim table as notifyOrderStatus(), so a manual send from
 * the admin UI and this watcher can never double-message a customer: whoever
 * inserts the (order, status) row first owns that message.
 *
 * Orders are read by id, so a big table is not a problem — the loop keeps a
 * high-water mark and only looks at what changed.
 */
import { dbPool } from '../db';
import { notifyOrderStatus, ensureAutomationSchema } from './waOrderStatus';

const POLL_MS = Number(process.env.WA_STATUS_POLL_MS || 30_000);

// Master outbound switch. WhatsApp restricted the account on 2026-10-03, and a
// message sent while restricted does not deliver but does deepen the
// restriction. One flag gates every outbound path so a path cannot be missed:
// the cron was stopped first and the watcher would still have sent.
// Read at call time, not at import time. ESM hoists every import above the
// statements in server.ts, so a value captured here ran before dotenv.config()
// had populated process.env and always saw 'true'.
const outboundEnabled = () =>
  String(process.env.WA_OUTBOUND_ENABLED ?? 'true').toLowerCase() !== 'false';

// Dashboard-internal states, not steps in the customer's journey. `trash` is the
// status an order takes when it is deleted from the dashboard; announcing it
// would tell a customer their order was thrown away. The watcher re-checks
// recent orders every 30s, so without this the log filled with "MISSING
// TEMPLATE for status trash" for the same two orders forever and buried real
// alerts. Legacy aliases are deliberately absent from this list: `cancell`,
// `on-hold` and `confimed` are genuine statuses in the data and must keep
// resolving to their canonical template.
const NON_CUSTOMER_STATUSES = ['trash', 'deleted', 'test', 'draft'];
// Interpolated into the poll below as a literal list. The values are hardcoded
// constants and cannot carry a quote, so this stays injection-safe and keeps one
// list instead of two that can drift apart.
const NON_CUSTOMER_SQL = NON_CUSTOMER_STATUSES.map((s) => `'${s}'`).join(',');
// Do not announce ancient backlog on boot; anything older is assumed already
// handled by the shop before automation existed.
const BOOT_GRACE_MINUTES = Number(process.env.WA_STATUS_BOOT_GRACE_MIN || 30);

let timer: NodeJS.Timeout | null = null;
let running = false;
let lastId = 0;

async function tick() {
  if (running) return;
  running = true;
  try {
    if (!lastId) {
      // Boot: start from the newest order so we do not spam a backlog.
      const [r]: any = await dbPool.query('SELECT COALESCE(MAX(id), 0) AS m FROM bf_orders');
      lastId = Number(r[0]?.m || 0);
      console.log(`[WA Watch] armed at order #${lastId} (polling every ${POLL_MS / 1000}s)`);
      return;
    }

    // Orders can also be edited in place (status changed on an old order), so
    // re-check recent orders, not only new ones.
    const [rows]: any = await dbPool.query(
      `SELECT o.id, o.status, o.updated_at
         FROM bf_orders o
        WHERE o.updated_at > DATE_SUB(NOW(), INTERVAL 2 DAY)
          AND o.status IS NOT NULL AND o.status <> ''
          AND LOWER(TRIM(o.status)) NOT IN (${NON_CUSTOMER_SQL})
        ORDER BY o.id DESC LIMIT 300`
    );

    for (const o of rows) {
      if (Number(o.id) <= lastId) continue;
      lastId = Math.max(lastId, Number(o.id));
    }

    for (const o of rows) {
      const changedAt = new Date(o.updated_at || 0).getTime();
      if (Date.now() - changedAt < BOOT_GRACE_MINUTES * 60_000) {
        // notifyOrderStatus is idempotent and returns a reason, so calling it
        // for an already-announced status is cheap and safe.
        await notifyOrderStatus(o.id, o.status);
      }
    }
  } catch (e: any) {
    console.error('[WA Watch] tick failed:', e?.message);
  } finally {
    running = false;
  }
}

export function startOrderStatusWatcher() {
  if (timer) return;
  console.log('[WA Watch] order-status automation starting');
  // Build the event/audit tables now, not on the first send, so the
  // admin UI has something to read the moment it loads.
  ensureAutomationSchema().then(() => console.log('[WA Watch] schema ready')).catch((e) => console.error('[WA Watch] schema init failed:', e?.message));
  if (!outboundEnabled()) {
    console.warn(
      '[WA Watch] OUTBOUND DISABLED (WA_OUTBOUND_ENABLED=false) - no status messages will be sent. ' +
      'The site, dashboard and templates keep working.'
    );
    return;
  }
  timer = setInterval(tick, POLL_MS);
  // Give the server a moment to finish booting before the first pass.
  setTimeout(tick, 10_000);
  if (typeof timer.unref === 'function') timer.unref();
}

export function stopOrderStatusWatcher() {
  if (timer) clearInterval(timer);
  timer = null;
}
