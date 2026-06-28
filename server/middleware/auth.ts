import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'bunon_super_secret_key_2026';

export const verifyAdmin = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ ok: false, msg: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];

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
export const requirePermission = (module: string, action: 'view' | 'edit' | 'delete') => {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    
    // Super Admins bypass permission checks
    if (user.role === 'super_admin' || user.role === 'admin') {
      return next();
    }
    
    // Check specific module permissions for staff
    const userPerms = user.permissions || {};
    const moduleAccess = userPerms[module]; // e.g. "edit" or "view"
    
    if (!moduleAccess) {
      return res.status(403).json({ ok: false, msg: `Access denied. You don't have permission for ${module}.` });
    }

    // Hierarchy of access: delete > edit > view
    const accessLevels = { view: 1, edit: 2, delete: 3 };
    const userLevel = accessLevels[moduleAccess as keyof typeof accessLevels] || 0;
    const requiredLevel = accessLevels[action] || 0;

    if (userLevel >= requiredLevel) {
      return next();
    }

    return res.status(403).json({ ok: false, msg: `Access denied. Requires ${action} permission for ${module}.` });
  };
};
