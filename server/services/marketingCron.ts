/**
 * Marketing cron runner for bunon.shop.
 *
 * Usage:
 *   npx tsx server/services/marketingCron.ts recovery     # cart-recovery sweep
 *   npx tsx server/services/marketingCron.ts newsletter   # daily showcase newsletter
 *   npx tsx server/services/marketingCron.ts recovery --dry   # report only, no mail
 *   npx tsx server/services/marketingCron.ts newsletter --dry
 *
 * Both jobs are idempotent enough to be re-run safely: the recovery queue is
 * gated on attempts/status columns, and the newsletter only mails rows still
 * marked 'subscribed'.
 */
import { processCartRecoveryCampaign } from './recoveryCron';
import { sendDailyNewsletter } from './email';

const job = (process.argv[2] || '').toLowerCase();
const dry = process.argv.includes('--dry');

async function dryRecovery() {
  const { productDbPool } = await import('../db');
  const cutoff = new Date(Date.now() - 60 * 60 * 1000);
  const seq = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [jobs]: any = await productDbPool.execute(
    `SELECT id,email,attempts,last_attempt_at FROM wc_cart_recovery_queue
     WHERE status='pending' AND attempts < 3
       AND ((last_attempt_at IS NULL AND created_at <= ?) OR last_attempt_at <= ?)`,
    [cutoff, seq]
  );
  const [subs]: any = await productDbPool.execute(
    `SELECT COUNT(*) c FROM wc_marketing_emails WHERE status='subscribed'`
  );
  console.log(`[DRY] recovery: ${jobs?.length ?? 0} job(s) would be processed`);
  (jobs ?? []).forEach((j: any) =>
    console.log(`   id=${j.id} email=${j.email} attempts=${j.attempts}`)
  );
  console.log(`[DRY] newsletter: ${subs?.[0]?.c ?? 0} subscriber(s) would be mailed`);
}

async function dryNewsletter() {
  const { getCachedProducts } = await import('./redisClient');
  const p = await getCachedProducts();
  console.log(`[DRY] newsletter would pick 3 of ${p?.length ?? 0} cached products`);
}

(async () => {
  const started = Date.now();
  try {
    if (job === 'recovery') {
      if (dry) return await dryRecovery();
      await processCartRecoveryCampaign();
    } else if (job === 'newsletter') {
      if (dry) return await dryNewsletter();
      await sendDailyNewsletter();
    } else {
      console.error('usage: marketingCron.ts <recovery|newsletter> [--dry]');
      process.exit(2);
    }
    console.log(`[Cron] ${job} finished in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    process.exit(0);
  } catch (e: any) {
    console.error(`[Cron] ${job} failed:`, e?.message || e);
    process.exit(1);
  }
})();
