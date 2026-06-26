import express from 'express';
import { dbPool, productDbPool } from '../db';
import { sendOrderConfirmationEmail } from '../services/email';
import { fixEmailTypos, isRoleBasedEmail } from '../utils/emailValidator';
import { redisClient } from '../services/redisClient';

const router = express.Router();

// 1. Capture Incomplete Order and Register to recovery queue
router.post('/orders/save_to_wp.php', async (req, res) => {
  try {
    // 🚀 FIX: Handle text/plain body from sendBeacon (browsers send text/plain)
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) {
        return res.status(400).json({ ok: false, msg: 'Invalid JSON in text body' });
      }
    }

    const { customer_name, phone, address, city, email, cart_products } = body || {};

    const cleanPhoneForKey = phone ? String(phone).replace(/\D/g, '') : '';
    const cleanEmailForKey = email ? String(email).trim().toLowerCase() : '';

    // 🚀 SERVER-SIDE DEDUPLICATION: Block same phone:email combo for 30 minutes using Redis
    if (cleanPhoneForKey || cleanEmailForKey) {
      const dedupeKey = `autofill:${cleanPhoneForKey || 'nophone'}:${cleanEmailForKey || 'noemail'}`;
      try {
        const alreadySent = await redisClient.get(dedupeKey);
        if (alreadySent) {
          // Silently ignore duplicate — don't log, don't process
          return res.json({ ok: true, msg: 'Already captured.' });
        }
        // Mark as captured — expires in 30 minutes (1800 seconds)
        await redisClient.set(dedupeKey, '1', { EX: 1800 });
      } catch (redisErr) {
        // If Redis fails, continue normally (don't block the request)
      }
    }

    console.log(`[AUTOFILL CAPTURE] Name: ${customer_name || 'N/A'}, Phone: ${phone || 'N/A'}, Email: ${email || 'N/A'}`);

    if (!phone && !email) {
      return res.status(400).json({ ok: false, msg: 'Invalid Data - Email or Phone required' });
    }

    const cleanPhone = phone ? phone.replace(/\D/g, '') : '';
    let cleanEmail = email || '';
    
    // Auto-fix typos and check if role-based
    cleanEmail = fixEmailTypos(cleanEmail);
    const isValidMarketingEmail = cleanEmail.includes('@') && !cleanEmail.endsWith('@bunon.shop') && !isRoleBasedEmail(cleanEmail);

    const cartJson = JSON.stringify(cart_products || []);
    const customerName = customer_name || 'Guest';

    // 🚀 FIX: Forward the exact payload to the original PHP API on dash.bunonfabrics.com 
    // so the dashboard calculates amounts and statuses correctly.
    // Dashboard REQUIRES phone to function, so only forward if cleanPhone exists.
    if (cleanPhone.length >= 11) {
      try {
        fetch('https://dash.bunonfabrics.com/api/orders/save_to_wp.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body || {})
        }).catch(err => console.error('[Forwarding] Failed to forward to dash:', err));
      } catch (e) {
        console.error('Fetch error:', e);
      }
    }

    // Also register user's marketing profile if email is valid
    if (isValidMarketingEmail) {
      try {
        await productDbPool.execute(`
          INSERT INTO wc_marketing_emails (email, phone, name, status)
          VALUES (?, ?, ?, 'subscribed')
          ON DUPLICATE KEY UPDATE phone = VALUES(phone), name = VALUES(name)
        `, [cleanEmail, cleanPhone, customerName]);
      } catch (err) {
        console.error('Marketing email insert error:', err);
      }
    }

    // 🚀 FIX #7: Bridge to wc_cart_recovery_queue (productDbPool) so recovery cron can find it.
    if (isValidMarketingEmail) {
      try {
        // If cleanPhone is empty, we still save it. We'll set phone to a placeholder or empty string
        await productDbPool.execute(`
          INSERT INTO wc_cart_recovery_queue (email, phone, customer_name, cart_data, status, attempts, created_at)
          VALUES (?, ?, ?, ?, 'pending', 0, NOW())
          ON DUPLICATE KEY UPDATE cart_data = VALUES(cart_data), customer_name = VALUES(customer_name), 
            status = 'pending', created_at = NOW()
        `, [cleanEmail, cleanPhone || '', customerName, cartJson]);
      } catch (bridgeErr: any) {
        console.error('[Recovery Bridge] Failed to sync to recovery queue:', bridgeErr.message);
      }
    }

    return res.json({ ok: true, msg: 'Forwarded to dash and registered locally.' });
  } catch (error: any) {
    console.error('[Marketing Engine] Failed to save incomplete order:', error.message);
    return res.status(500).json({ ok: false, msg: 'DB Error' });
  }
});

// 2. Remove Incomplete Order
router.get('/orders/remove_incomplete.php', async (req, res) => {
  try {
    const phone = req.query.phone;
    if (!phone) {
      return res.status(400).json({ ok: false, msg: 'Phone number is required' });
    }

    const cleanPhone = String(phone).replace(/\D/g, '');
    
    // Forward to original PHP API
    try {
      fetch(`https://dash.bunonfabrics.com/api/orders/remove_incomplete.php?phone=${cleanPhone}`)
        .catch(err => console.error('[Forwarding] Failed to forward remove_incomplete:', err));
    } catch (e) {
      console.error('Fetch error:', e);
    }

    return res.json({ ok: true, msg: 'Forwarded remove_incomplete to dash.' });
  } catch (error: any) {
    console.error('[Marketing Engine] Failed to remove incomplete order:', error.message);
    return res.status(500).json({ ok: false, msg: 'DB Error' });
  }
});

export default router;
