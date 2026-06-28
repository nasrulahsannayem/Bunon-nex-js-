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
    
    if (decoded.role !== 'admin' && decoded.role !== 'staff') {
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
