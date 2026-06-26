import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { productDbPool } from '../db';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'bunon_super_secret_key_2026';

// Register or Auto-register handled in payment.ts, but here is manual login
router.post('/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    
    if (!phone || !password) {
      return res.status(400).json({ ok: false, msg: 'Phone and password required' });
    }

    const cleanPhone = phone.replace(/\D/g, '');

    const [users]: any = await productDbPool.execute(
      `SELECT * FROM bunon_users WHERE phone = ? LIMIT 1`,
      [cleanPhone]
    );

    if (!users || users.length === 0) {
      return res.status(401).json({ ok: false, msg: 'Invalid credentials' });
    }

    const user = users[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(401).json({ ok: false, msg: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, phone: user.phone, role: user.role },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      ok: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        default_address: user.default_address,
        default_city: user.default_city
      }
    });

  } catch (error: any) {
    console.error('[Auth API] Login Error:', error.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

// Manual Registration
router.post('/register', async (req, res) => {
  try {
    const { phone, password, name, email } = req.body;
    
    if (!phone || !password) {
      return res.status(400).json({ ok: false, msg: 'Phone and password required' });
    }

    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length !== 11) {
      return res.status(400).json({ ok: false, msg: 'Valid 11-digit phone required' });
    }

    // Check if exists
    const [existing]: any = await productDbPool.execute(
      `SELECT id FROM bunon_users WHERE phone = ? LIMIT 1`,
      [cleanPhone]
    );

    if (existing && existing.length > 0) {
      return res.status(400).json({ ok: false, msg: 'Phone number already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const [result]: any = await productDbPool.execute(
      `INSERT INTO bunon_users (phone, password_hash, name, email) VALUES (?, ?, ?, ?)`,
      [cleanPhone, hashedPassword, name || null, email || null]
    );

    const token = jwt.sign(
      { id: result.insertId, phone: cleanPhone, role: 'customer' },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      ok: true,
      token,
      user: {
        id: result.insertId,
        name: name || null,
        phone: cleanPhone,
        email: email || null
      }
    });

  } catch (error: any) {
    console.error('[Auth API] Register Error:', error.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

// Middleware to verify token
export const verifyToken = (req: any, res: any, next: any) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ ok: false, msg: 'No token provided' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ ok: false, msg: 'Invalid token' });
  }
};

// Get current profile
router.get('/profile', verifyToken, async (req: any, res) => {
  try {
    const [users]: any = await productDbPool.execute(
      `SELECT id, name, phone, email, default_address, default_city FROM bunon_users WHERE id = ?`,
      [req.user.id]
    );

    if (!users || users.length === 0) {
      return res.status(404).json({ ok: false, msg: 'User not found' });
    }

    res.json({ ok: true, user: users[0] });
  } catch (error: any) {
    console.error('[Auth API] Profile Error:', error.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

// Update profile
router.put('/profile', verifyToken, async (req: any, res) => {
  try {
    const { name, email, default_address, default_city } = req.body;
    
    await productDbPool.execute(
      `UPDATE bunon_users SET name = ?, email = ?, default_address = ?, default_city = ? WHERE id = ?`,
      [name || null, email || null, default_address || null, default_city || null, req.user.id]
    );

    res.json({ ok: true, msg: 'Profile updated' });
  } catch (error: any) {
    console.error('[Auth API] Update Error:', error.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

// Get user orders
router.get('/orders', verifyToken, async (req: any, res) => {
  try {
    const [users]: any = await productDbPool.execute(`SELECT phone FROM bunon_users WHERE id = ?`, [req.user.id]);
    if (!users || users.length === 0) return res.status(404).json({ ok: false });
    
    const phone = users[0].phone;
    
    import('../db').then(async ({ dbPool }) => {
      try {
        const [orders]: any = await dbPool.execute(
          `SELECT id, invoice, created_at, status, total_payable as amount 
           FROM bf_orders WHERE phone = ? ORDER BY created_at DESC LIMIT 50`,
          [phone]
        );
        res.json({ ok: true, orders });
      } catch (err) {
        res.json({ ok: true, orders: [] });
      }
    });

  } catch (error: any) {
    console.error('[Auth API] Orders Error:', error.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

export default router;
