import express from 'express';
import { dbPool } from '../../db';

const router = express.Router();

// GET /api/admin/orders (List with filters and status counts)
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = 20; // 20 per page like the old planner maybe?
    const offset = (page - 1) * limit;

    const status = req.query.status as string;
    const courier = req.query.courier as string;
    const search = req.query.search as string;

    let whereClauses = [];
    let params: string[] = [];

    if (status && status !== 'all' && status !== '') {
      whereClauses.push('status = ?');
      params.push(status);
    }
    if (courier && courier !== 'all' && courier !== '') {
      // If courier is steadfast, we can check consignment_id IS NOT NULL
      if (courier === 'steadfast') {
        whereClauses.push('consignment_id IS NOT NULL');
      } else {
        whereClauses.push('consignment_id IS NULL');
      }
    }
    if (search && search !== '') {
      whereClauses.push('(invoice LIKE ? OR phone LIKE ? OR customer_name LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const whereString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const [orders]: any = await dbPool.execute(
      `SELECT id, invoice, created_at, status, total_payable, customer_name, phone, city, address, consignment_id, tracking_code 
       FROM bf_orders 
       ${whereString}
       ORDER BY created_at DESC 
       LIMIT ? OFFSET ?`,
      [...params, limit.toString(), offset.toString()]
    );

    const [countResult]: any = await dbPool.execute(`SELECT COUNT(id) as total FROM bf_orders ${whereString}`, params);
    const total = countResult[0].total;

    // Fetch Status Counts for the tabs
    const [statusCounts]: any = await dbPool.execute(`
      SELECT status, COUNT(id) as count 
      FROM bf_orders 
      GROUP BY status
    `);

    res.json({
      ok: true,
      orders,
      statusCounts,
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

// GET /api/admin/orders/:id (Details for Order Journey)
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Order info
    const [orders]: any = await dbPool.execute(
      `SELECT * FROM bf_orders WHERE id = ? LIMIT 1`,
      [id]
    );
    
    if (orders.length === 0) {
      return res.status(404).json({ ok: false, msg: 'Order not found' });
    }
    
    const order = orders[0];

    // Order Items
    const [items]: any = await dbPool.execute(
      `SELECT * FROM bf_order_items WHERE order_id = ?`,
      [order.id || id] // Try fallback if id mismatch
    );

    // Order Logs (If exists, else empty array)
    let logs = [];
    try {
      const [orderLogs]: any = await dbPool.execute(`SELECT * FROM bf_order_logs WHERE order_id = ? ORDER BY created_at DESC`, [id]);
      logs = orderLogs;
    } catch (e) {
      // Table might not exist yet
    }

    res.json({
      ok: true,
      order,
      items,
      logs
    });

  } catch (error: any) {
    console.error('[Admin API] Order Details Error:', error.message);
    res.status(500).json({ ok: false, msg: 'Server error fetching order details' });
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
