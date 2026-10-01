import express from 'express';
import { dbPool, productDbPool } from '../../db';

const router = express.Router();

// GET /api/admin/customers?search=&min_orders=&min_spent=&page=&limit=
router.get('/', async (req, res) => {
  try {
    const search = String(req.query.search || '').trim();
    const minOrders = Number(req.query.min_orders || 0);
    const minSpent = Number(req.query.min_spent || 0);
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
    const offset = (page - 1) * limit;

    const where: string[] = [];
    const params: any[] = [];
    if (search) {
      where.push('(phone LIKE ? OR customer_name LIKE ?)');
      params.push('%' + search + '%', '%' + search + '%');
    }
    const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const sql = [
      'SELECT phone,',
      'MAX(customer_name) AS customer_name,',
      'MAX(city) AS city,',
      'MAX(address) AS address,',
      'COUNT(id) AS order_count,',
      'COALESCE(SUM(total_payable), 0) AS total_spent,',
      'MAX(created_at) AS last_order',
      'FROM bf_orders ' + whereStr,
      'GROUP BY phone',
      'HAVING COUNT(id) >= ? AND COALESCE(SUM(total_payable), 0) >= ?',
      'ORDER BY MAX(created_at) DESC',
      'LIMIT ? OFFSET ?',
    ].join(' ');
    const [rows]: any = await dbPool.execute(sql, [...params, minOrders, minSpent, limit, offset]);
    const [cnt]: any = await dbPool.execute(
      'SELECT COUNT(*) AS total FROM ( SELECT phone FROM bf_orders ' +
        whereStr +
        ' GROUP BY phone HAVING COUNT(id) >= ? AND COALESCE(SUM(total_payable), 0) >= ? ) t',
      [...params, minOrders, minSpent]
    );
    const total = Number(cnt[0]?.total || 0);

    const phones = (rows as any[]).map((r) => r.phone).filter(Boolean);
    const userMap: Record<string, any> = {};
    if (phones.length) {
      const placeholders = phones.map(() => '?').join(',');
      const [users]: any = await productDbPool.query(
        'SELECT phone, name, email, default_city, default_address, created_at FROM bunon_users WHERE phone IN (' +
          placeholders + ')',
        phones
      );
      for (const u of users as any[]) userMap[u.phone] = u;
    }
    const customers = (rows as any[]).map((r) => ({
      phone: r.phone,
      customer_name: r.customer_name,
      city: r.city,
      address: r.address,
      order_count: Number(r.order_count),
      total_spent: Number(r.total_spent),
      last_order: r.last_order,
      registered: userMap[r.phone] || null,
    }));
    res.json({ ok: true, customers, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (e: any) {
    console.error('[Admin Customers] List error:', e.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

// GET /api/admin/customers/:phone/history
router.get('/:phone/history', async (req, res) => {
  try {
    const phone = req.params.phone;
    const [orders]: any = await dbPool.execute(
      'SELECT id, invoice, status, total_payable, customer_name, phone, city, address, consignment_id, tracking_code, created_at FROM bf_orders WHERE phone = ? ORDER BY created_at DESC LIMIT 100',
      [phone]
    );
    const [agg]: any = await dbPool.execute(
      'SELECT COUNT(id) AS order_count, COALESCE(SUM(total_payable), 0) AS total_spent, MAX(created_at) AS last_order FROM bf_orders WHERE phone = ?',
      [phone]
    );
    let notes: any[] = [];
    try {
      const [n]: any = await productDbPool.execute(
        'SELECT id, note, created_by, created_at FROM bunon_customer_notes WHERE phone = ? ORDER BY id DESC LIMIT 50',
        [phone]
      );
      notes = n;
    } catch { notes = []; }
    res.json({
      ok: true,
      phone,
      totals: { order_count: Number(agg[0]?.order_count || 0), total_spent: Number(agg[0]?.total_spent || 0), last_order: agg[0]?.last_order || null },
      orders,
      notes,
    });
  } catch (e: any) {
    console.error('[Admin Customers] History error:', e.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

// PUT /api/admin/customers/:phone/note
router.put('/:phone/note', async (req, res) => {
  try {
    const phone = req.params.phone;
    const { note, order_id } = req.body || {};
    if (!note || !String(note).trim()) return res.status(400).json({ ok: false, msg: 'note required' });
    await productDbPool.execute(
      'CREATE TABLE IF NOT EXISTS bunon_customer_notes (id INT AUTO_INCREMENT PRIMARY KEY, phone VARCHAR(30) NOT NULL, note TEXT NOT NULL, created_by VARCHAR(100) NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, INDEX(phone))'
    );
    const createdBy = (req as any).user?.phone || String((req as any).user?.id ?? 'admin');
    const [r]: any = await productDbPool.execute(
      'INSERT INTO bunon_customer_notes (phone, note, created_by) VALUES (?, ?, ?)',
      [phone, String(note).trim(), String(createdBy)]
    );
    if (order_id) {
      try {
        await dbPool.execute(
          'INSERT INTO bf_order_logs (order_id, log_type, message, created_by, created_at) VALUES (?, ?, ?, ?, NOW())',
          [order_id, 'note', 'Note: ' + String(note).trim(), String(createdBy)]
        );
      } catch (e: any) { console.error('[Admin Customers] Order-log note failed:', e.message); }
    }
    res.json({ ok: true, id: r.insertId });
  } catch (e: any) {
    console.error('[Admin Customers] Note error:', e.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

export default router;
