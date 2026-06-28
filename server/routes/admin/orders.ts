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
      `SELECT id, invoice, created_at, status, total_payable, customer_name, phone, city 
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

// POST /api/admin/orders/:id/courier/steadfast
router.post('/:id/courier/steadfast', async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch order details
    const [orders]: any = await dbPool.execute(
      `SELECT invoice, customer_name, phone, address, city, total_payable, consignment_id, status 
       FROM bf_orders WHERE id = ? LIMIT 1`,
      [id]
    );

    if (orders.length === 0) return res.status(404).json({ ok: false, msg: 'Order not found' });
    const order = orders[0];

    if (order.consignment_id) {
      return res.status(400).json({ ok: false, msg: 'Already booked with Steadfast' });
    }

    // Steadfast API Setup
    const apiKey = process.env.STEADFAST_API_KEY;
    const secretKey = process.env.STEADFAST_SECRET_KEY;

    if (!apiKey || !secretKey) {
      return res.status(500).json({ ok: false, msg: 'Steadfast API keys are missing in .env' });
    }

    const payload = {
      invoice: order.invoice,
      recipient_name: order.customer_name,
      recipient_phone: order.phone,
      recipient_address: `${order.address}, ${order.city}`,
      cod_amount: Number(order.total_payable),
      note: 'Bunon Auto Booking'
    };

    const response = await fetch('https://portal.packzy.com/api/v1/create_order', {
      method: 'POST',
      headers: {
        'Api-Key': apiKey,
        'Secret-Key': secretKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (result.status === 200 && result.consignment) {
      // Save consignment to database
      await dbPool.execute(
        `UPDATE bf_orders SET consignment_id = ?, tracking_code = ?, status = 'processing' WHERE id = ?`,
        [result.consignment.consignment_id, result.consignment.tracking_code, id]
      );
      return res.json({ ok: true, msg: 'Successfully booked with Steadfast!', consignment: result.consignment });
    } else {
      console.error('[Steadfast API Error]', result);
      return res.status(400).json({ ok: false, msg: result.message || 'Steadfast booking failed' });
    }

  } catch (error: any) {
    console.error('[Admin API] Steadfast Booking Error:', error.message);
    res.status(500).json({ ok: false, msg: 'Server error processing booking' });
  }
});

export default router;
