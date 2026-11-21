/**
 * DRY RUN for the cart-recovery queue. Sends nothing.
 *
 * Loads the exact same rows the cron will select, with the same precedence
 * bug fixed, and prints a decision line per job so the blast radius is
 * visible before any real mail goes out.
 */
import { productDbPool } from '../server/db';

(async () => {
  const cutoffTime = new Date(Date.now() - 60 * 60 * 1000);
  const sequenceCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [jobs]: any = await productDbPool.execute(`
    SELECT * FROM wc_cart_recovery_queue
    WHERE status = 'pending'
      AND attempts < 3
      AND (
        (last_attempt_at IS NULL AND created_at <= ?)
        OR last_attempt_at <= ?
      )
  `, [cutoffTime, sequenceCutoff]);

  console.log(`\n=== SELECTED FOR MAIL: ${jobs?.length ?? 0} ===`);

  for (const j of jobs ?? []) {
    const email = String(j.email ?? '').trim();
    const hasEmail = email.includes('@');
    let items: any[] = [];
    try { items = JSON.parse(j.cart_data || '[]'); } catch {}

    // same double-check the cron does before sending
    const [recent]: any = await productDbPool.execute(
      `SELECT id FROM wc_marketing_emails WHERE email = ? AND last_email_sent_at > ?`,
      [email, j.created_at]
    );
    const [sub]: any = hasEmail
      ? await productDbPool.execute(`SELECT status FROM wc_marketing_emails WHERE email = ?`, [email])
      : [[]];

    const cartTotal = items.reduce((s: number, it: any) => s + Number(it.price) * Number(it.quantity), 0);
    const nextAttempt = Number(j.attempts) + 1;
    const pct = 5 + nextAttempt * 5;
    let disc = Math.floor((cartTotal * pct / 100) / 10) * 10;
    if (disc < 10) disc = 10;
    disc = Math.min(disc, 150);

    let verdict: string;
    if (!hasEmail) verdict = 'SKIP - no email (phone-only COD)';
    else if (recent?.length) verdict = 'CANCEL - recent order placed';
    else if (sub?.[0]?.status === 'unsubscribed') verdict = 'SKIP - unsubscribed';
    else if (items.length === 0) verdict = 'CANCEL - empty cart';
    else verdict = `WOULD SEND - attempt ${nextAttempt}, ৳${disc} discount`;

    console.log(
      `  id=${j.id} email=${email || '(none)'} phone=${j.phone || '-'} ` +
      `attempts=${j.attempts} items=${items.length} total=৳${cartTotal} => ${verdict}`
    );
  }

  // how many rows the OLD buggy query would have wrongly included
  const [buggy]: any = await productDbPool.execute(`
    SELECT id, status FROM wc_cart_recovery_queue
    WHERE status = 'pending'
      AND (last_attempt_at IS NULL AND created_at <= ?)
      OR (last_attempt_at <= ? AND attempts < 3)
  `, [cutoffTime, sequenceCutoff]);
  const extra = (buggy ?? []).filter((b: any) => b.status !== 'pending');
  console.log(`\n=== OLD BUGGY QUERY: ${buggy?.length ?? 0} rows, ${extra.length} with non-pending status ===`);
  extra.forEach((e: any) => console.log(`  would have wrongly picked up: id=${e.id} status=${e.status}`));

  process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
