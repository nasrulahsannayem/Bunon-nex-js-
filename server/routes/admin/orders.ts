import express from 'express';
import { dbPool } from '../../db';

const router = express.Router();

// GET /api/admin/orders
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = 50;
    const offset = (page - 1) * limit;

    const [orders]: any = await dbPool.execute(
      `SELECT id, invoice, created_at, status, total_payable, name, phone, city 
       FROM bf_orders 
       ORDER BY created_at DESC 
       LIMIT ? OFFSET ?`,
      [limit.toString(), offset.toString()]
    );

    const [countResult]: any = await dbPool.execute(`SELECT COUNT(id) as total FROM bf_orders`);
    const total = countResult[0].total;

    res.json({
      ok: true,
      orders,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (error: any) {
    console.error('[Admin API] Orders Error:', error.message);
    res.status(500).json({ ok: false, msg: 'Server error fetching orders' });
  }
});

// PUT /api/admin/orders/:id/status
router.put('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const { id } = req.params;

    if (!status) return res.status(400).json({ ok: false, msg: 'Status is required' });

    await dbPool.execute(
      `UPDATE bf_orders SET status = ? WHERE id = ?`,
      [status, id]
    );

    res.json({ ok: true, msg: 'Order status updated' });
  } catch (error: any) {
    console.error('[Admin API] Update Order Error:', error.message);
    res.status(500).json({ ok: false, msg: 'Server error updating order' });
  }
});

export default router;
