import express from 'express';
import { productDbPool } from '../../db';

const router = express.Router();

// GET /api/admin/products
router.get('/', async (req, res) => {
  try {
    const [products]: any = await productDbPool.execute(
      `SELECT id, name, slug, price, regular_price, sale_price, stock_status, stock_quantity 
       FROM bunon_products 
       ORDER BY id DESC LIMIT 50`
    );

    res.json({ ok: true, products });
  } catch (error: any) {
    console.error('[Admin API] Products Error:', error.message);
    res.status(500).json({ ok: false, msg: 'Server error fetching products' });
  }
});

export default router;
