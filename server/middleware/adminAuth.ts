import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { productDbPool } from '../db';

const JWT_SECRET = process.env.JWT_SECRET || 'bunon_super_secret_key_2026';

export interface AdminRequest extends Request {
  user?: any;
}

export const requireAdmin = async (req: AdminRequest, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ ok: false, msg: 'No token provided' });
  }

  try {
    const decoded: any = jwt.verify(token, JWT_SECRET);
    
    // Double check with DB to ensure role hasn't changed
    const [users]: any = await productDbPool.execute(
      `SELECT role FROM bunon_users WHERE id = ? LIMIT 1`,
      [decoded.id]
    );

    if (!users || users.length === 0 || (users[0].role !== 'admin' && users[0].role !== 'staff')) {
      return res.status(403).json({ ok: false, msg: 'Admin or Staff access required' });
    }

    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ ok: false, msg: 'Invalid token' });
  }
};
