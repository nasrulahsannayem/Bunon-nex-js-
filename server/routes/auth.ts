import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { productDbPool } from '../db';

const router = express.Router();

// ===== Google OAuth (customer sign-in) =====
const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET || '';
const REDIRECT_URI =
  process.env.GOOGLE_OAUTH_REDIRECT_URI ||
  'https://bunonfabrics.com/api/auth/google/callback';
const AUTH_URI = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URI = 'https://oauth2.googleapis.com/token';
const USERINFO_URI = 'https://openidconnect.googleapis.com/v1/userinfo';
const STATE_COOKIE = 'google_oauth_state';
const STATE_TTL_MS = 10 * 60 * 1000;

const configured = () => Boolean(CLIENT_ID && CLIENT_SECRET);

// No cookie-parser dependency: read/write the single cookie by hand.
const setStateCookie = (res: express.Response, state: string) => {
  res.append(
    'Set-Cookie',
    `${STATE_COOKIE}=${state}; Max-Age=${Math.floor(STATE_TTL_MS / 1000)}; Path=/; HttpOnly; Secure; SameSite=Lax`
  );
};

const readCookie = (req: express.Request, name: string): string | null => {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
};

const clearStateCookie = (res: express.Response) => {
  res.append('Set-Cookie', `${STATE_COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`);
};


const JWT_SECRET = process.env.JWT_SECRET || 'bunon_super_secret_key_2026';

// Register or Auto-register handled in payment.ts, but here is manual login
router.post('/login', async (req, res) => {
  try {
    const { phone, username, password } = req.body;
    const identifier = phone ?? username;
    
    if (!identifier || !password) {
      return res.status(400).json({ ok: false, msg: 'Phone/username and password required' });
    }

    const rawId = String(identifier).trim();
    const cleanPhone = rawId.replace(/\D/g, '');

    const isPhoneLogin = /^\d{11}$/.test(cleanPhone);
    let users: any;
    if (isPhoneLogin) {
      [users] = await productDbPool.execute(
        `SELECT * FROM bunon_users WHERE phone = ? LIMIT 1`,
        [cleanPhone]
      );
    } else {
      [users] = await productDbPool.execute(
        `SELECT * FROM bunon_users WHERE username = ? LIMIT 1`,
        [rawId.toLowerCase()]
      );
    }

    if (!users || users.length === 0) {
      return res.status(401).json({ ok: false, msg: 'Invalid credentials' });
    }

    const user = users[0];
    if (user.status && user.status !== 'active')
      return res.status(403).json({ ok: false, msg: 'Account disabled' });
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(401).json({ ok: false, msg: 'Invalid credentials' });
    }

    productDbPool.execute('UPDATE bunon_users SET last_login = NOW() WHERE id = ?', [user.id]).catch(() => {});
    let loginPerms: string[] = [];
    try {
      const rawPerms: unknown = (user as { permissions?: unknown }).permissions;
      loginPerms = Array.isArray(rawPerms) ? rawPerms as string[] : JSON.parse((rawPerms as string) || '[]');
      if (!Array.isArray(loginPerms)) loginPerms = [];
    } catch { loginPerms = []; }
    const token = jwt.sign(
      { id: user.id, phone: user.phone, role: user.role, permissions: loginPerms },
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
        default_city: user.default_city,
        role: user.role,
        permissions: loginPerms,
        username: user.username ?? null,
        status: user.status ?? 'active',
        photo: user.photo ?? null
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

// Forgot Password
router.post('/forgot-password', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ ok: false, msg: 'ফোন নম্বর প্রয়োজন' });

    const cleanPhone = phone.replace(/\D/g, '');

    const [users]: any = await productDbPool.execute(
      `SELECT * FROM bunon_users WHERE phone = ? LIMIT 1`,
      [cleanPhone]
    );

    if (!users || users.length === 0) {
      return res.status(404).json({ ok: false, msg: 'এই নম্বরে কোনো অ্যাকাউন্ট পাওয়া যায়নি।' });
    }

    const user = users[0];

    if (!user.email || !user.email.includes('@')) {
      return res.status(400).json({ 
        ok: false, 
        msg: 'আপনার অ্যাকাউন্টে কোনো ইমেইল যুক্ত নেই। অনুগ্রহ করে 09611900606 নম্বরে কল করে পাসওয়ার্ড রিসেট করুন।' 
      });
    }

    // Generate random 6 digit password
    const newPassword = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update DB
    await productDbPool.execute(
      `UPDATE bunon_users SET password_hash = ? WHERE id = ?`,
      [hashedPassword, user.id]
    );

    // Send Email
    try {
      const { mailTransporter } = await import('../services/email');
      await mailTransporter.sendMail({
        from: '"Bunon Fabrics" <admin@bunonfabrics.com>',
        to: user.email,
        subject: 'Password Reset - Bunon Fabrics',
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
            <h2 style="color: #e2136e;">পাসওয়ার্ড রিসেট</h2>
            <p>প্রিয় গ্রাহক,</p>
            <p>আপনার অ্যাকাউন্ট (ফোন: ${user.phone}) এর জন্য নতুন একটি পাসওয়ার্ড তৈরি করা হয়েছে:</p>
            <div style="background: #f9fafb; padding: 15px; border-radius: 5px; margin: 20px 0; font-size: 20px; font-weight: bold; text-align: center; letter-spacing: 2px;">
              ${newPassword}
            </div>
            <p>দয়া করে এই পাসওয়ার্ড দিয়ে লগইন করুন এবং পরবর্তীতে আপনার প্রোফাইল থেকে পাসওয়ার্ড পরিবর্তন করে নিন (শীঘ্রই এই ফিচারটি আসছে)।</p>
            <p>ধন্যবাদ,<br/>বুনন ফেব্রিক্স টিম</p>
          </div>
        `
      });
      res.json({ ok: true, msg: `আপনার ইমেইলে (${user.email.substring(0, 3)}***@...) নতুন পাসওয়ার্ড পাঠানো হয়েছে।` });
    } catch (mailErr: any) {
      console.error('[Auth API] Mail Send Error:', mailErr.message);
      res.status(500).json({ ok: false, msg: 'পাসওয়ার্ড রিসেট হয়েছে, কিন্তু ইমেইল সার্ভারে সমস্যার কারণে ইমেইল পাঠানো সম্ভব হয়নি। অনুগ্রহ করে সাপোর্টে যোগাযোগ করুন।' });
    }

  } catch (error: any) {
    console.error('[Auth API] Forgot Password Error:', error.message);
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
      `SELECT id, name, phone, email, default_address, default_city, role FROM bunon_users WHERE id = ?`,
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
        const [orders]: any = await productDbPool.execute(
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

// Public endpoint for order tracking by phone number
router.get('/track-order', async (req: any, res) => {
  try {
    const phone = req.query.phone;
    if (!phone) return res.status(400).json({ ok: false, msg: 'Phone number required' });
    
    import('../db').then(async ({ dbPool }) => {
      try {
        const [orders]: any = await productDbPool.execute(
          `SELECT id, invoice, created_at, status, total_payable as amount, 
                  customer_name, phone, address, city, state, 
                  subtotal, delivery_fee, discount_amount, payment_method, is_paid, cod_amount 
           FROM bf_orders WHERE phone = ? ORDER BY created_at DESC LIMIT 1`,
          [phone]
        );
        
        if (orders.length > 0) {
          const [items]: any = await productDbPool.execute(
            `SELECT product_name as name, qty as quantity, price, thumb as thumbnail 
             FROM bf_order_items WHERE order_id = ?`,
            [orders[0].id]
          );
          orders[0].items = items;
        }

        res.json({ ok: true, orders });
      } catch (err) {
        res.json({ ok: true, orders: [] });
      }
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

// Device token registration API
router.post('/device-token', async (req: any, res) => {
  try {
    const { token, platform } = req.body;
    if (!token) return res.status(400).json({ ok: false, msg: 'Token is required' });

    const { dbPool } = await import('../db');
    await productDbPool.execute(
      'INSERT INTO bf_device_tokens (token, platform) VALUES (?, ?) ON DUPLICATE KEY UPDATE platform = VALUES(platform)',
      [token, platform || 'web']
    );
    res.json({ ok: true, msg: 'Device token registered successfully' });
  } catch (err: any) {
    console.error('Token registration error:', err.message);
    res.status(500).json({ ok: false, msg: err.message });
  }
});

// ===== Google OAuth routes =====
// Step 1 — bounce the browser to Google's consent screen.
router.get('/google', (req, res) => {
  if (!configured()) {
    return res
      .status(503)
      .json({ ok: false, msg: 'Google sign-in is not configured on this server.' });
  }
  const state = crypto.randomBytes(24).toString('hex');
  setStateCookie(res, state);

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    // openid+email+profile are the minimum for identity. No sensitive scopes —
    // which also keeps the app out of Google's "sensitive scope" verification
    // queue and under the 100-user cap while testing is unverified.
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
    access_type: 'online',
  });
  res.redirect(`${AUTH_URI}?${params.toString()}`);
});

// Step 2 — Google redirects back with ?code=...&state=...
router.get('/google/callback', async (req, res) => {
  const fail = (msg: string, code = 400) =>
    res.redirect(`/login?error=${encodeURIComponent(msg)}`);

  if (!configured()) return fail('Google sign-in is not configured.', 503);

  const { code, state, error } = req.query as Record<string, string | undefined>;
  if (error) return fail(error);
  if (!code) return fail('Missing authorization code.');
  if (!state) return fail('Missing state parameter.');

  const savedState = readCookie(req, STATE_COOKIE);
  if (!savedState || savedState !== state) {
    return fail('State mismatch. Please try signing in again.');
  }
  clearStateCookie(res);

  try {
    // Exchange the code for an access token.
    const tokenRes = await fetch(TOKEN_URI, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });
    const tokenJson: any = await tokenRes.json();
    if (!tokenRes.ok || !tokenJson.access_token) {
      console.error('[GoogleAuth] token exchange failed:', tokenJson);
      return fail('Could not complete sign-in with Google.');
    }

    // Read the identity.
    const infoRes = await fetch(USERINFO_URI, {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    const info: any = await infoRes.json();
    if (!infoRes.ok || !info.sub) {
      console.error('[GoogleAuth] userinfo failed:', info);
      return fail('Could not read your Google account.');
    }

    const googleId = String(info.sub);
    const email = info.email ? String(info.email).toLowerCase() : null;
    const name = info.name || (email ? email.split('@')[0] : null);
    const picture = info.picture || null;
    if (!email) return fail('Your Google account did not share an email address.');

    // Already linked to a Google account?
    const [byGoogle]: any = await productDbPool.execute(
      `SELECT id, phone, email, name, role, photo FROM bunon_users WHERE google_id = ? LIMIT 1`,
      [googleId]
    );
    let userId: number;

    if (byGoogle && byGoogle.length > 0) {
      userId = byGoogle[0].id;
      // Refresh the avatar/name if Google gave us a fresher one.
      await productDbPool.execute(
        `UPDATE bunon_users SET name = COALESCE(?, name), google_picture = COALESCE(?, google_picture),
                                photo = COALESCE(?, photo), last_login = NOW() WHERE id = ?`,
        [name, picture, picture, userId]
      );
    } else {
      // An older password account with the same email? Link it, don't duplicate.
      const [byEmail]: any = await productDbPool.execute(
        `SELECT id FROM bunon_users WHERE email = ? LIMIT 1`,
        [email]
      );
      if (byEmail && byEmail.length > 0) {
        userId = byEmail[0].id;
        await productDbPool.execute(
          `UPDATE bunon_users SET google_id = ?, name = COALESCE(name, ?),
                                  google_picture = COALESCE(?, google_picture),
                                  photo = COALESCE(photo, ?), last_login = NOW() WHERE id = ?`,
          [googleId, name, picture, picture, userId]
        );
      } else {
        // No account yet — create one, exactly like the register form does
        // except with no phone/password (both stay NULL).
        const [ins]: any = await productDbPool.execute(
          `INSERT INTO bunon_users (email, name, google_id, google_picture, photo, role, status, last_login)
           VALUES (?, ?, ?, ?, ?, 'customer', 'active', NOW())`,
          [email, name, googleId, picture, picture]
        );
        userId = ins.insertId;
        console.log('[GoogleAuth] auto-created account', userId, 'for', email);
      }
    }

    const [rows]: any = await productDbPool.execute(
      `SELECT id, phone, email, name, role, photo, google_picture FROM bunon_users WHERE id = ? LIMIT 1`,
      [userId]
    );
    const u = rows[0];

    // Same JWT shape as /login and /register, so Profile.tsx needs no change.
    const token = jwt.sign({ id: u.id, phone: u.phone, role: u.role }, JWT_SECRET, {
      expiresIn: '30d',
    });

    // Hand the token to the SPA without putting it in a URL that could leak
    // into history, referrers or logs.
    res.redirect(
      `/login#token=${encodeURIComponent(token)}&name=${encodeURIComponent(u.name || '')}` +
        `&email=${encodeURIComponent(u.email || '')}` +
        `&picture=${encodeURIComponent(picture || '')}`
    );
  } catch (err: any) {
    console.error('[GoogleAuth] error:', err.message);
    res.redirect(`/login?error=${encodeURIComponent('Google sign-in failed. Please try again.')}`);
  }
});


export default router;

