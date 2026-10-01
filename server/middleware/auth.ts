import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'bunon_super_secret_key_2026';

export const verifyAdmin = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  // Fallback: ?token= query (for window.open CSV/file downloads that can't set headers)
  const queryToken = (req.query as any)?.token;

  let token: string | undefined;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (typeof queryToken === 'string' && queryToken.length > 10) {
    token = queryToken;
  } else {
    return res.status(401).json({ ok: false, msg: 'No token provided' });
  }

  try {
    const decoded: any = jwt.verify(token, JWT_SECRET);
    
    if (!['admin', 'super_admin', 'staff'].includes(decoded.role)) {
      return res.status(403).json({ ok: false, msg: 'Access denied: Admin privileges required' });
    }
    
    // Attach user to request
    (req as any).user = decoded;
    next();
  } catch (err) {
    console.error('[Auth Middleware] JWT Verify Error:', err);
    return res.status(401).json({ ok: false, msg: 'Invalid or expired token' });
  }
};

// Dynamic RBAC Middleware
// RBAC: single permission-key check (DB stores JSON array, embedded in JWT).
// Legacy two-arg calls requirePermission('orders','view') still compile: the
// optional 2nd arg maps module+action to the matching key.
const LEGACY_MODULE_MAP: Record<string, string> = {
  stats: 'view_reports',
  settings: 'manage_settings',
};

const resolveKey = (key: string, action?: string): string => {
  if (!action) return key;
  if (LEGACY_MODULE_MAP[key]) return LEGACY_MODULE_MAP[key];
  return `${action}_${key}`;
};

const getPermArray = (user: any): string[] => {
  if (Array.isArray(user.permissions)) return user.permissions;
  if (typeof user.permissions === 'string') {
    try {
      const p = JSON.parse(user.permissions);
      if (Array.isArray(p)) return p;
    } catch { return []; }
  }
  return [];
};

export const requirePermission = (key: string, _action?: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ ok: false, msg: 'No token provided' });
    }
    // No client-trust: reload fresh role + permissions from DB on every check.
    // JWT claim is only a fallback if the DB lookup fails.
    let role: string = user.role;
    let perms: string[] = getPermArray(user);
    try {
      const { productDbPool } = await import('../db');
      const [rows]: any = await productDbPool.execute(
        'SELECT role, permissions FROM bunon_users WHERE id = ? LIMIT 1',
        [user.id]
      );
      if (rows?.length) {
        role = rows[0].role ?? role;
        perms = getPermArray(rows[0]);
      }
    } catch (e) {
      console.error('[requirePermission] DB reload failed, using JWT claim:', (e as Error)?.message);
    }
    // super_admin bypasses everything
    if (role === 'super_admin') {
      return next();
    }
    const need = resolveKey(key, _action);
    // admin bypasses everything except user management
    if (role === 'admin') {
      if (need === 'manage_users') {
        return res.status(403).json({ ok: false, msg: 'Access denied. Requires super_admin.' });
      }
      return next();
    }
    // staff/customer: array-includes check against DB-loaded perms
    if (perms.includes(need)) {
      return next();
    }
    return res.status(403).json({ ok: false, msg: `Access denied. Requires ${need}.` });
  };
};

// DB-fresh OR-guard: staff passes holding ANY listed key (replaces JWT-claim checks).
export const requireAnyPermission = (keys: string[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ ok: false, msg: 'No token provided' });
    }
    let role: string = user.role;
    let perms: string[] = getPermArray(user);
    try {
      const { productDbPool } = await import('../db');
      const [rows]: any = await productDbPool.execute(
        'SELECT role, permissions FROM bunon_users WHERE id = ? LIMIT 1',
        [user.id]
      );
      if (rows?.length) {
        role = rows[0].role ?? role;
        perms = getPermArray(rows[0]);
      }
    } catch (e) {
      console.error('[requireAnyPermission] DB reload failed, using JWT claim:', (e as Error)?.message);
    }
    if (role === 'super_admin') return next();
    if (role === 'admin') {
      if (keys.includes('manage_users')) {
        return res.status(403).json({ ok: false, msg: 'Access denied. Requires super_admin.' });
      }
      return next();
    }
    if (keys.some((k) => perms.includes(k))) return next();
    return res.status(403).json({ ok: false, msg: 'Access denied. Requires ' + keys.join(' or ') + '.' });
  };
};
