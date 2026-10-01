import express from 'express';
import { productDbPool } from '../../db';

const router = express.Router();

// GET /api/admin/marketing/abandoned-carts
router.get('/abandoned-carts', async (req, res) => {
  try {
    const [carts]: any = await productDbPool.execute(
      'SELECT id, email, phone, customer_name, address, city, cart_data, status, discount_offered, created_at, updated_at FROM wc_cart_recovery_queue ORDER BY updated_at DESC LIMIT 100'
    );

    // Parse the JSON string cart_data so frontend can read it
    const formattedCarts = carts.map((cart: any) => {
      let parsed: any[] = [];
      try { parsed = JSON.parse(cart.cart_data || '[]'); } catch { parsed = []; }
      return { ...cart, cart_data: parsed };
    });

    res.json({ ok: true, carts: formattedCarts });
  } catch (error: any) {
    console.error('[Admin API] Carts Error:', error.message);
    res.status(500).json({ ok: false, msg: 'Server error fetching abandoned carts' });
  }
});

// DELETE /api/admin/marketing/abandoned-carts/:id — remove one incomplete row
router.delete('/abandoned-carts/:id', async (req, res) => {
  try {
    await productDbPool.execute('DELETE FROM wc_cart_recovery_queue WHERE id = ?', [req.params.id]);
    res.json({ ok: true, msg: 'Deleted.' });
  } catch (error: any) {
    console.error('[Admin API] Cart Delete Error:', error.message);
    res.status(500).json({ ok: false, msg: 'Delete failed' });
  }
});

// POST /api/admin/marketing/abandoned-carts/:id/remind { channel: sms|note }
router.post('/abandoned-carts/:id/remind', async (req, res) => {
  try {
    const { channel } = req.body || {};
    if (!['sms', 'note'].includes(channel)) {
      return res.status(400).json({ ok: false, msg: 'channel must be sms|note' });
    }
    const [rows]: any = await productDbPool.execute(
      'SELECT id, phone, customer_name, status FROM wc_cart_recovery_queue WHERE id = ? LIMIT 1',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ ok: false, msg: 'Cart not found' });
    await productDbPool.execute(
      "UPDATE wc_cart_recovery_queue SET status = 'sent', attempts = attempts + 1, last_attempt_at = NOW() WHERE id = ?",
      [req.params.id]
    );
    console.log('[Admin Marketing] Cart remind id=' + req.params.id + ' channel=' + channel);
    res.json({ ok: true, id: Number(req.params.id), channel, status: 'sent' });
  } catch (e: any) {
    console.error('[Admin Marketing] Remind error:', e.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

// POST /api/admin/marketing/abandoned-carts/:id/offer { discount }
router.post('/abandoned-carts/:id/offer', async (req, res) => {
  try {
    const { discount } = req.body || {};
    if (discount == null || Number(discount) < 0) {
      return res.status(400).json({ ok: false, msg: 'discount required (>= 0)' });
    }
    const [rows]: any = await productDbPool.execute(
      'SELECT id FROM wc_cart_recovery_queue WHERE id = ? LIMIT 1',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ ok: false, msg: 'Cart not found' });
    await productDbPool.execute(
      'UPDATE wc_cart_recovery_queue SET discount_offered = ? WHERE id = ?',
      [Number(discount), req.params.id]
    );
    res.json({ ok: true, id: Number(req.params.id), discount_offered: Number(discount) });
  } catch (e: any) {
    console.error('[Admin Marketing] Offer error:', e.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

export default router;
