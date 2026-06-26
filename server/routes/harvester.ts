import express from 'express';
import { dbPool } from '../db';
import { sendOrderConfirmationEmail } from '../services/email';

const router = express.Router();

// 1. Capture Incomplete Order and Register to recovery queue
router.post('/orders/save_to_wp.php', async (req, res) => {
  try {
    const { customer_name, phone, address, city, email, cart_products } = req.body;

    if (!phone) {
      return res.status(400).json({ ok: false, msg: 'Invalid Data' });
    }

    const cleanPhone = phone.replace(/\D/g, '');
    const cleanEmail = email || '';
    const cartJson = JSON.stringify(cart_products || []);
    const customerName = customer_name || 'Guest';
    const customerAddress = address || '';

    // 1. Check if there is a pending order for this phone within the last 1 hour
    const [existingRows]: any = await dbPool.execute(
      `SELECT id, created_at FROM wpdf_orderguard_incomplete_orders 
       WHERE phone = ? AND status = 'pending' 
       ORDER BY created_at DESC LIMIT 1`,
      [cleanPhone]
    );

    let shouldUpdate = false;
    let existingId = null;

    if (existingRows && existingRows.length > 0) {
      const existing = existingRows[0];
      const lastTime = new Date(existing.created_at).getTime();
      // If less than 1 hour (3600 seconds)
      if ((Date.now() - lastTime) < 3600000) {
        shouldUpdate = true;
        existingId = existing.id;
      }
    }

    if (shouldUpdate) {
      // Update existing record
      await dbPool.execute(
        `UPDATE wpdf_orderguard_incomplete_orders 
         SET name = ?, address = ?, cart_data = ?, created_at = NOW() 
         WHERE id = ?`,
        [customerName, customerAddress, cartJson, existingId]
      );
    } else {
      // Insert new record
      await dbPool.execute(
        `INSERT INTO wpdf_orderguard_incomplete_orders 
         (name, phone, address, cart_data, status, created_at) 
         VALUES (?, ?, ?, ?, 'pending', NOW())`,
        [customerName, cleanPhone, customerAddress, cartJson]
      );
    }

    // Also register user's marketing profile if email is provided
    if (cleanEmail && cleanEmail.includes('@') && !cleanEmail.endsWith('@bunon.shop')) {
      await dbPool.execute(`
        INSERT INTO wc_marketing_emails (email, phone, name, status)
        VALUES (?, ?, ?, 'subscribed')
        ON DUPLICATE KEY UPDATE phone = VALUES(phone), name = VALUES(name)
      `, [cleanEmail, cleanPhone, customerName]);
    }

    return res.json({ ok: true, msg: shouldUpdate ? 'Updated existing record.' : 'Created new record.' });
  } catch (error: any) {
    console.error('[Marketing Engine] Failed to save incomplete order:', error.message);
    return res.status(500).json({ ok: false, msg: 'DB Error' });
  }
});

export default router;
