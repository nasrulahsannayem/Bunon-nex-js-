import { wpDbPool } from '../db';
import { sendCartRecoveryEmail } from '../services/email';

export async function processCartRecoveryCampaign() {
  console.log("[Recovery] Starting cart recovery cron processor...");
  try {
    // 1. Fetch pending orders in recovery queue that were created more than 1 hour ago
    // Attempt sequence runs every 24 hours up to 3 times
    const cutoffTime = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
    const sequenceCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago for next attempt

    const [jobs]: any = await wpDbPool.execute(`
      SELECT * FROM wc_cart_recovery_queue 
      WHERE status = 'pending' 
        AND (last_attempt_at IS NULL AND created_at <= ?)
        OR (last_attempt_at <= ? AND attempts < 3)
    `, [cutoffTime, sequenceCutoff]);

    if (!jobs || jobs.length === 0) {
      console.log("[Recovery] No pending recovery jobs to process.");
      return;
    }

    for (const job of jobs) {
      // 2. Double check if this user placed an order in the meantime to avoid sending spam
      const [recentOrder]: any = await productDbPool.execute(`
        SELECT id FROM wc_marketing_emails 
        WHERE email = ? AND last_email_sent_at > ?
      `, [job.email, job.created_at]);

      // If they placed an order or manually opted out, cancel the recovery job
      if (recentOrder && recentOrder.length > 0) {
        await wpDbPool.execute(`UPDATE wc_cart_recovery_queue SET status = 'converted' WHERE id = ?`, [job.id]);
        continue;
      }

      // Generate a dynamic discount between 5% and 20%
      const nextAttempt = job.attempts + 1;
      const discountPercent = 5 + (nextAttempt * 5); // 1st try = 10%, 2nd = 15%, 3rd = 20%
      
      let cartItems = [];
      try {
        cartItems = JSON.parse(job.cart_data || '[]');
      } catch (e) {}

      if (cartItems.length === 0) {
        await wpDbPool.execute(`UPDATE wc_cart_recovery_queue SET status = 'cancelled' WHERE id = ?`, [job.id]);
        continue;
      }

      // Send recovery email
      await sendCartRecoveryEmail(job.email, job.phone, job.customer_name, cartItems, discountPercent);

      // Update queue job state
      await productDbPool.execute(`
        UPDATE wc_cart_recovery_queue 
        SET attempts = ?, last_attempt_at = NOW(), discount_offered = ?
        WHERE id = ?
      `, [nextAttempt, discountPercent, job.id]);
    }
  } catch (err: any) {
    console.error("[Recovery] Cron job execution failed:", err.message);
  }
}
