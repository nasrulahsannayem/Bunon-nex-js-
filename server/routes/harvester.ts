import express from 'express';
import { dbPool } from '../db';
import { sendOrderConfirmationEmail } from '../services/email';

const router = express.Router();

// 1. Capture Incomplete Order and Register to recovery queue
router.post('/orders/save_to_wp.php', async (req, res) => {
  try {
    const { customer_name, phone, address, city, email, cart_products } = req.body;

    if (!phone || phone.replace(/\D/g, '').length < 11) {
      return res.status(400).json({ ok: false, message: 'Invalid phone number' });
    }

    const cleanPhone = phone.replace(/\D/g, '');
    const cleanEmail = email || '';

    // Save/update incomplete recovery database queue
    const cartJson = JSON.stringify(cart_products || []);
    
    await dbPool.execute(`
      INSERT INTO wc_cart_recovery_queue (email, phone, customer_name, cart_data, status)
      VALUES (?, ?, ?, ?, 'pending')
      ON DUPLICATE KEY UPDATE 
        customer_name = VALUES(customer_name),
        cart_data = VALUES(cart_data),
        status = IF(status = 'converted', 'converted', 'pending')
    `, [cleanEmail || null, cleanPhone, customer_name || 'Guest', cartJson]);

    // Also register user's marketing profile if email is provided
    if (cleanEmail && cleanEmail.includes('@')) {
      await dbPool.execute(`
        INSERT INTO wc_marketing_emails (email, phone, name, status)
        VALUES (?, ?, ?, 'subscribed')
        ON DUPLICATE KEY UPDATE phone = VALUES(phone), name = VALUES(name)
      `, [cleanEmail, cleanPhone, customer_name || 'Guest']);
    }

    return res.json({ ok: true, message: 'Incomplete order captured and saved.' });
  } catch (error: any) {
    console.error('[Marketing Engine] Failed to save incomplete order:', error.message);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
