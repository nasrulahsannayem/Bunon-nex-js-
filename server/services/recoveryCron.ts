import { productDbPool } from '../db';
import { sendCartRecoveryEmail } from '../services/email';

export async function processCartRecoveryCampaign() {
  console.log("[Recovery] Starting cart recovery cron processor...");
  try {
    // 1. Fetch pending orders in recovery queue that were created more than 1 hour ago
    // Attempt sequence runs every 24 hours up to 3 times
    const cutoffTime = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
    const sequenceCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago for next attempt

    const [jobs]: any = await productDbPool.execute(`
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
        await productDbPool.execute(`UPDATE wc_cart_recovery_queue SET status = 'converted' WHERE id = ?`, [job.id]);
        continue;
      }

      let cartItems = [];
      try {
        cartItems = JSON.parse(job.cart_data || '[]');
      } catch (e) {}

      if (cartItems.length === 0) {
        await productDbPool.execute(`UPDATE wc_cart_recovery_queue SET status = 'cancelled' WHERE id = ?`, [job.id]);
        continue;
      }

      // Calculate dynamic discount up to 150 BDT based on cart total and attempt
      const nextAttempt = job.attempts + 1;
      const discountPercent = 5 + (nextAttempt * 5); // 10%, 15%, 20%
      const cartTotal = cartItems.reduce((sum: number, item: any) => sum + (Number(item.price) * Number(item.quantity)), 0);
      
      let calculatedDiscount = Math.floor((cartTotal * discountPercent / 100) / 10) * 10;
      if (calculatedDiscount < 10) calculatedDiscount = 10;
      const discountAmount = Math.min(calculatedDiscount, 150);

      // Send recovery email
      await sendCartRecoveryEmail(job.email, job.phone, job.customer_name, cartItems, discountAmount);

      // Update queue job state
      await productDbPool.execute(`
        UPDATE wc_cart_recovery_queue 
        SET attempts = ?, last_attempt_at = NOW(), discount_offered = ?
        WHERE id = ?
      `, [nextAttempt, discountAmount, job.id]);
    }
  } catch (err: any) {
    console.error("[Recovery] Cron job execution failed:", err.message);
  }
}
