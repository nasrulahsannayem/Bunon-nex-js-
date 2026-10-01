import express from 'express';
import bcrypt from 'bcryptjs';
import { productDbPool } from '../../db';
import { requirePermission } from '../../middleware/auth';
import { logAudit, auditCtx } from '../../utils/audit';

const router = express.Router();

// Grouped permission model (48 keys). ADDITIVE ONLY - never remove/rename a key
// (JWTs + DB rows already carry old keys).
// overview: view_dashboard | orders: view/create/edit/status/courier/bulk/delete
// courier-tracking: view/sync | inventory: view/adjust | products: view/create/edit/delete
// customers/marketing/coupons/blogs/categories: view/edit | reports: view
// media: manage/upload | recycle-bin: view/restore/delete(future) | users/settings: view/manage
// soon (no module yet, UI-disabled, no enforcement): tickets, addons (+attendance/leave/tasks UI-only)
export const VALID_PERMS = [
  'view_dashboard',
  'view_orders', 'create_orders', 'edit_orders', 'update_order_status', 'book_courier', 'bulk_orders', 'delete_orders',
  'view_courier_tracking', 'sync_courier_status',
  'view_inventory', 'adjust_inventory',
  'view_products', 'create_products', 'edit_products', 'delete_products',
  'view_customers', 'edit_customers',
  'view_marketing', 'edit_marketing',
  'view_coupons', 'edit_coupons',
  'view_reports',
  'view_kpi_sales', 'view_kpi_orders', 'view_kpi_carts', 'view_kpi_users', 'view_kpi_products', 'view_kpi_live', 'view_kpi_advanced',
  'view_blogs', 'edit_blogs',
  'view_categories', 'edit_categories',
  'manage_media', 'upload_media',
  'view_trash', 'restore_trash', 'delete_trash',
  'view_users', 'manage_users',
  'view_settings', 'manage_settings',
  'view_tickets', 'create_ticket', 'reply_ticket',
  'view_addons', 'manage_addons',
];

const parsePerms = (raw: unknown): string[] => {
  if (Array.isArray(raw)) return raw.filter((p) => VALID_PERMS.includes(p));
  if (typeof raw === 'string') {
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr.filter((p) => VALID_PERMS.includes(p));
    } catch { return []; }
  }
  return [];
};

const isSuper = (req: express.Request) => (req as unknown as { user?: { role?: string } }).user?.role === 'super_admin';
const me = (req: express.Request) => (req as unknown as { user: { id: number; role: string } }).user;

// GET /api/admin/users — list (no password_hash)
// ?role=staff|admin|super_admin|customer|all (default staff = all non-customer)
router.get('/', requirePermission('manage_users'), async (req: any, res) => {
  try {
    const role = String(req.query.role || 'staff').toLowerCase();
    let where = "role != 'customer'";
    const params: string[] = [];
    if (role === 'staff') {
      where = "role != 'customer'";
    } else if (['admin', 'super_admin', 'customer'].includes(role)) {
      where = 'role = ?';
      params.push(role);
    }
    const [rows]: any = await productDbPool.execute(
      'SELECT id, name, phone, email, username, status, photo, role, permissions, created_at, last_login FROM bunon_users WHERE ' + where + ' ORDER BY id DESC LIMIT 100',
      params
    );
    const [counts]: any = await productDbPool.execute(
      'SELECT role, COUNT(id) as c FROM bunon_users GROUP BY role'
    );
    const users = (rows as any[]).map((u) => ({ ...u, permissions: parsePerms(u.permissions) }));
    res.json({ ok: true, users, counts, filter: role });
  } catch (e: any) {
    console.error('[Admin Users] List error:', e.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

// POST /api/admin/users — create staff/admin
router.post('/', requirePermission('manage_users'), async (req: any, res) => {
  try {
    const { name, phone, password, role, permissions, username, photo } = req.body;
    const cleanPhone = String(phone || '').replace(/\D/g, '');
    if (cleanPhone.length !== 11)
      return res.status(400).json({ ok: false, msg: 'Valid 11-digit phone required' });
    if (!password || String(password).length < 6)
      return res.status(400).json({ ok: false, msg: 'Password min 6 chars' });
    if (role === 'super_admin' && !isSuper(req))
      return res.status(403).json({ ok: false, msg: 'Only super_admin can create super_admin' });
    if (!['staff', 'admin', 'super_admin'].includes(role))
      return res.status(400).json({ ok: false, msg: 'Role must be staff|admin' + (isSuper(req) ? '|super_admin' : '') });

    if (permissions !== undefined && !Array.isArray(permissions))
      return res.status(400).json({ ok: false, msg: 'permissions must be an array' });
    if (Array.isArray(permissions) && permissions.some((p: string) => !VALID_PERMS.includes(p)))
      return res.status(400).json({ ok: false, msg: 'Invalid permission key' });
    const perms = parsePerms(permissions ?? []);

    const [existing]: any = await productDbPool.execute(
      'SELECT id, role FROM bunon_users WHERE phone = ? LIMIT 1', [cleanPhone]
    );
    if (existing?.length)
      return res.status(409).json({ ok: false, msg: 'Phone already registered', code: 'PHONE_EXISTS', role: existing[0].role, user_id: existing[0].id });

    let cleanUsername: string | null = null;
    if (username !== undefined && username !== null && String(username).trim() !== '') {
      cleanUsername = String(username).trim().toLowerCase();
      if (!/^[a-z0-9_.]{3,32}$/.test(cleanUsername))
        return res.status(400).json({ ok: false, msg: 'Username: 3-32 chars, a-z 0-9 _ .' });
      const [uExist]: any = await productDbPool.execute(
        'SELECT id FROM bunon_users WHERE username = ? LIMIT 1', [cleanUsername]
      );
      if (uExist?.length)
        return res.status(409).json({ ok: false, msg: 'Username already taken', code: 'USERNAME_EXISTS' });
    }

    const hash = await bcrypt.hash(password, 10);
    const [result]: any = await productDbPool.execute(
      'INSERT INTO bunon_users (name, phone, password_hash, role, permissions, username, photo) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [name || null, cleanPhone, hash, role, JSON.stringify(perms), cleanUsername, (photo as string) || null]
    );
    res.status(201).json({ ok: true, id: result.insertId });
    void logAudit({ ...auditCtx(req), action: 'user_create', module: 'users', target: result.insertId, detail: role });
  } catch (e: any) {
    if (e?.code === 'ER_DUP_ENTRY') {
      if (String(e?.sqlMessage || '').includes('username'))
        return res.status(409).json({ ok: false, msg: 'Username already taken', code: 'USERNAME_EXISTS' });
      return res.status(409).json({ ok: false, msg: 'Phone already registered' });
    }
    console.error('[Admin Users] Create error:', e.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

// POST /api/admin/users/convert — upgrade existing customer row to staff/admin
// body: { phone, role, password, permissions?, name? }
router.post('/convert', requirePermission('manage_users'), async (req: any, res) => {
  try {
    const { phone, role, password, permissions, name } = req.body || {};
    const cleanPhone = String(phone || '').replace(/\D/g, '');
    if (cleanPhone.length !== 11)
      return res.status(400).json({ ok: false, msg: 'Valid 11-digit phone required' });
    if (!password || String(password).length < 6)
      return res.status(400).json({ ok: false, msg: 'Password min 6 chars' });
    if (!['staff', 'admin', 'super_admin'].includes(role))
      return res.status(400).json({ ok: false, msg: 'Role must be staff|admin|super_admin' });
    if (role === 'super_admin' && !isSuper(req))
      return res.status(403).json({ ok: false, msg: 'Only super_admin can create super_admin' });
    const [rows]: any = await productDbPool.execute(
      'SELECT id, role FROM bunon_users WHERE phone = ? LIMIT 1', [cleanPhone]
    );
    if (!rows?.length)
      return res.status(404).json({ ok: false, msg: 'No account with this phone — use create instead' });
    if (rows[0].role !== 'customer')
      return res.status(409).json({ ok: false, msg: 'Already ' + rows[0].role + ' — edit from staff tab', code: 'PHONE_EXISTS', role: rows[0].role, user_id: rows[0].id });
    if (permissions !== undefined && !Array.isArray(permissions))
      return res.status(400).json({ ok: false, msg: 'permissions must be an array' });
    if (Array.isArray(permissions) && permissions.some((x: string) => !VALID_PERMS.includes(x)))
      return res.status(400).json({ ok: false, msg: 'Invalid permission key' });
    const hash = await bcrypt.hash(password, 10);
    await productDbPool.execute(
      'UPDATE bunon_users SET role = ?, password_hash = ?, permissions = ?, name = COALESCE(?, name) WHERE id = ?',
      [role, hash, JSON.stringify(parsePerms(permissions ?? [])), name || null, rows[0].id]
    );
    res.json({ ok: true, id: rows[0].id, converted: true });
  } catch (e: any) {
    console.error('[Admin Users] Convert error:', e.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

// PUT /api/admin/users/:id — name/role
// PUT /api/admin/users/bulk-role — bulk role assign {ids, role}. Additive.
router.put('/bulk-role', requirePermission('manage_users'), async (req: any, res) => {
  try {
    const { ids, role } = req.body;
    if (!Array.isArray(ids) || !ids.length || ids.length > 100)
      return res.status(400).json({ ok: false, msg: 'ids array (1-100) required' });
    if (!['staff', 'admin', 'customer'].includes(role) && !(role === 'super_admin' && isSuper(req)))
      return res.status(400).json({ ok: false, msg: 'Invalid role' });
    const clean = ids.map(Number).filter(Boolean);
    if (clean.includes(me(req).id))
      return res.status(403).json({ ok: false, msg: 'Cannot change own role in bulk' });
    const ph = clean.map(() => '?').join(',');
    const [rows]: any = await productDbPool.execute('SELECT id, role FROM bunon_users WHERE id IN (' + ph + ')', clean);
    if ((rows || []).some((r: any) => r.role === 'super_admin') && !isSuper(req))
      return res.status(403).json({ ok: false, msg: 'Only super_admin can edit super_admin' });
    await productDbPool.execute('UPDATE bunon_users SET role = ? WHERE id IN (' + ph + ')', [role, ...clean]);
    res.json({ ok: true, updated: (rows || []).length });
    void logAudit({ ...auditCtx(req), action: 'user_bulk_role', module: 'users', detail: role + ':' + clean.join(',') });
  } catch (e: any) {
    console.error('[Admin Users] Bulk role error:', e.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

router.put('/:id', requirePermission('manage_users'), async (req: any, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ ok: false, msg: 'Invalid id' });
    const { name, role, username, status, photo, password } = req.body;

    const [rows]: any = await productDbPool.execute(
      'SELECT id, role FROM bunon_users WHERE id = ? LIMIT 1', [id]
    );
    if (!rows?.length) return res.status(404).json({ ok: false, msg: 'User not found' });
    const target = rows[0];

    if (role && role !== target.role) {
      if (!['staff', 'admin', 'customer', 'super_admin'].includes(role))
        return res.status(400).json({ ok: false, msg: 'Invalid role' });
      const touchesSuper = target.role === 'super_admin' || role === 'super_admin';
      if (touchesSuper && !isSuper(req))
        return res.status(403).json({ ok: false, msg: 'Only super_admin can change super_admin role' });
      if (id === me(req).id)
        return res.status(403).json({ ok: false, msg: 'Cannot change your own role' });
      await productDbPool.execute('UPDATE bunon_users SET role = ? WHERE id = ?', [role, id]);
    }
    if (name !== undefined)
      await productDbPool.execute('UPDATE bunon_users SET name = ? WHERE id = ?', [name || null, id]);
    if (username !== undefined) {
      const v = String(username || '').trim().toLowerCase();
      if (v === '') {
        await productDbPool.execute('UPDATE bunon_users SET username = NULL WHERE id = ?', [id]);
      } else {
        if (!/^[a-z0-9_.]{3,32}$/.test(v))
          return res.status(400).json({ ok: false, msg: 'Username: 3-32 chars, a-z 0-9 _ .' });
        const [uExist]: any = await productDbPool.execute(
          'SELECT id FROM bunon_users WHERE username = ? AND id != ? LIMIT 1', [v, id]
        );
        if (uExist?.length)
          return res.status(409).json({ ok: false, msg: 'Username already taken', code: 'USERNAME_EXISTS' });
        try {
          await productDbPool.execute('UPDATE bunon_users SET username = ? WHERE id = ?', [v, id]);
        } catch (e: any) {
          if (e?.code === 'ER_DUP_ENTRY')
            return res.status(409).json({ ok: false, msg: 'Username already taken', code: 'USERNAME_EXISTS' });
          throw e;
        }
      }
    }
    if (status !== undefined) {
      if (!['active', 'disabled'].includes(status))
        return res.status(400).json({ ok: false, msg: 'status must be active|disabled' });
      await productDbPool.execute('UPDATE bunon_users SET status = ? WHERE id = ?', [status, id]);
    }
    if (photo !== undefined)
      await productDbPool.execute('UPDATE bunon_users SET photo = ? WHERE id = ?', [(photo as string) || null, id]);
    if (password !== undefined && password !== null && String(password) !== '') {
      if (String(password).length < 6)
        return res.status(400).json({ ok: false, msg: 'Password min 6 chars' });
      const hash = await bcrypt.hash(String(password), 10);
      await productDbPool.execute('UPDATE bunon_users SET password_hash = ? WHERE id = ?', [hash, id]);
    }

    res.json({ ok: true });
    void logAudit({ ...auditCtx(req), action: 'user_update', module: 'users', target: id, detail: role || name || null });
  } catch (e: any) {
    console.error('[Admin Users] Update error:', e.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

// PUT /api/admin/users/:id/permissions — whitelist 48 grouped keys (see VALID_PERMS)
router.put('/:id/permissions', requirePermission('manage_users'), async (req: any, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ ok: false, msg: 'Invalid id' });
    let { permissions } = req.body;
    if (permissions && !Array.isArray(permissions) && typeof permissions === 'object') permissions = Object.keys(permissions).filter((k) => (permissions as any)[k]);
    if (!Array.isArray(permissions))
      return res.status(400).json({ ok: false, msg: 'permissions must be an array' });
    if (permissions.some((p: string) => !VALID_PERMS.includes(p)))
      return res.status(400).json({ ok: false, msg: 'Invalid permission key' });

    const [rows]: any = await productDbPool.execute(
      'SELECT id, role FROM bunon_users WHERE id = ? LIMIT 1', [id]
    );
    if (!rows?.length) return res.status(404).json({ ok: false, msg: 'User not found' });
    if (rows[0].role === 'super_admin' && !isSuper(req))
      return res.status(403).json({ ok: false, msg: 'Only super_admin can edit super_admin permissions' });

    await productDbPool.execute(
      'UPDATE bunon_users SET permissions = ? WHERE id = ?', [JSON.stringify(permissions), id]
    );
    res.json({ ok: true });
    void logAudit({ ...auditCtx(req), action: 'user_permissions', module: 'users', target: id, detail: JSON.stringify(permissions) });
  } catch (e: any) {
    console.error('[Admin Users] Perms error:', e.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

// DELETE /api/admin/users/:id — super_admin only, block self + last super_admin
router.delete('/:id', requirePermission('manage_users'), async (req: any, res) => {
  try {
    if (!isSuper(req))
      return res.status(403).json({ ok: false, msg: 'Only super_admin can delete users' });
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ ok: false, msg: 'Invalid id' });
    if (id === me(req).id)
      return res.status(403).json({ ok: false, msg: 'Cannot delete yourself' });

    const [rows]: any = await productDbPool.execute(
      'SELECT id, role FROM bunon_users WHERE id = ? LIMIT 1', [id]
    );
    if (!rows?.length) return res.status(404).json({ ok: false, msg: 'User not found' });
    if (rows[0].role === 'super_admin') {
      const [count]: any = await productDbPool.execute(
        "SELECT COUNT(*) AS c FROM bunon_users WHERE role = 'super_admin'"
      );
      if (count[0].c <= 1)
        return res.status(403).json({ ok: false, msg: 'Cannot delete the last super_admin' });
    }
    await productDbPool.execute('DELETE FROM bunon_users WHERE id = ?', [id]);
    res.json({ ok: true });
    void logAudit({ ...auditCtx(req), action: 'user_delete', module: 'users', target: id });
  } catch (e: any) {
    console.error('[Admin Users] Delete error:', e.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

export default router;
