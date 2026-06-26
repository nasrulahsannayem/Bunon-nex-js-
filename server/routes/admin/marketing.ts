import express from 'express';
import { productDbPool } from '../../db';

const router = express.Router();

// GET /api/admin/marketing/abandoned-carts
router.get('/abandoned-carts', async (req, res) => {
  try {
    const [carts]: any = await productDbPool.execute(`
      SELECT id, email, phone, customer_name, cart_data, status, discount_offered, created_at, updated_at
      FROM wc_cart_recovery_queue
      ORDER BY updated_at DESC
      LIMIT 100
    `);

    // Parse the JSON string cart_data so frontend can read it
    const formattedCarts = carts.map((cart: any) => ({
      ...cart,
      cart_data: JSON.parse(cart.cart_data || '[]')
    }));

    res.json({ ok: true, carts: formattedCarts });
  } catch (error: any) {
    console.error('[Admin API] Carts Error:', error.message);
    res.status(500).json({ ok: false, msg: 'Server error fetching abandoned carts' });
  }
});

export default router;
