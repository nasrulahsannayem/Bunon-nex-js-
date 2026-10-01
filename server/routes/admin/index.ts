import express, { Request, Response, NextFunction } from 'express';
import { verifyAdmin, requirePermission, requireAnyPermission } from '../../middleware/auth';

import marketingRoutes from './marketing';
import ordersRoutes from './orders';
import statsRoutes from './stats';
import productsRoutes from './products';
import mediaRoutes from './media';
import settingsRoutes from './settings'; // I will create this next
import categoriesRoutes from './categories';
import blogsRoutes from './blogs';
import usersRoutes from './users';
import customersRoutes from './customers';
import couponsRoutes from './coupons';
import reportsRoutes from './reports';
import inventoryRoutes from './inventory';
import auditRoutes from './audit';
import kpiAdvancedRoutes from './kpi_advanced';
import fraudRoutes from './fraud';
import couriersRoutes from './couriers';
import leaveRoutes from './leave';
import tasksRoutes from './tasks';
import teamRoutes from './team';
import whatsappRoutes from './whatsapp';
import profitRoutes from './profit';
import metaRoutes from './meta';

const router = express.Router();

// Webhook POSTs stay public (own token/key checks inside handlers).
router.use((req, res, next) => {
  if (req.method === 'POST' && (req.path === '/couriers/steadfast/webhook' || req.path === '/whatsapp/incoming')) return next();
  return (verifyAdmin as any)(req, res, next);
});

// Self permissions (DB-fresh) - lets the admin UI refresh role+perms without re-login.
router.get('/me', async (req: Request, res: Response) => {
  const user: any = (req as any).user || {};
  try {
    const { productDbPool } = await import('../../db');
    const [rows]: any = await productDbPool.execute(
      'SELECT id, role, permissions FROM bunon_users WHERE id = ? LIMIT 1',
      [user.id]
    );
    if (rows?.length) {
      let perms: unknown = rows[0].permissions;
      if (typeof perms === 'string') {
        try { perms = JSON.parse(perms); } catch { perms = []; }
      }
      return res.json({ ok: true, user: { id: rows[0].id, role: rows[0].role, permissions: perms } });
    }
  } catch (e) {
    console.error('[admin/me] DB lookup failed:', (e as Error)?.message);
  }
  return res.json({ ok: true, user: { id: user.id, role: user.role, permissions: user.permissions } });
});

// GET needs 'view', mutations need 'edit' (super_admin + admin bypass inside
// requirePermission; staff checked against permissions JSON).
const viewOrEdit = (module: string) => (req: Request, res: Response, next: NextFunction) =>
  requirePermission(module, req.method === 'GET' ? 'view' : 'edit')(req, res, next);

// Granular mount guard: new key first, legacy key fallback (additive - old staff keep working).
// DB-fresh via requireAnyPermission (no JWT-claim trust - fixes stale-perm hole).
const newOrLegacy = (fresh: string, legacy: string) => (req: Request, res: Response, next: NextFunction) =>
  (requireAnyPermission([fresh, legacy]) as any)(req, res, next);

router.use('/marketing', requirePermission('marketing', 'view'), marketingRoutes);
router.use('/orders', viewOrEdit('orders'), ordersRoutes);
router.use('/stats', requireAnyPermission(['view_reports', 'view_kpi_sales', 'view_kpi_orders', 'view_kpi_carts', 'view_kpi_users', 'view_kpi_products', 'view_kpi_live', 'view_kpi_advanced']), statsRoutes);
router.use('/products', (req: Request, res: Response, next: NextFunction) => {
  const key = req.method === 'DELETE' ? 'delete_products'
    : req.method === 'GET' ? 'view_products'
    : req.method === 'POST' ? 'create_products' : 'edit_products';
  if (req.method === 'POST') return newOrLegacy('create_products', 'edit_products')(req, res, next);
  return (requirePermission as any)(key)(req, res, next);
}, productsRoutes);
router.use('/media', (req: Request, res: Response, next: NextFunction) =>
  (req.method === 'GET' ? requirePermission('manage_media') : newOrLegacy('upload_media', 'manage_media'))(req, res, next), mediaRoutes);
router.use('/settings', viewOrEdit('settings'), settingsRoutes);
router.use('/categories', viewOrEdit('categories'), categoriesRoutes);
router.use('/blogs', viewOrEdit('blogs'), blogsRoutes);
router.use('/users', (req, res, next) => {
  if (req.method === 'GET') return (requireAnyPermission(['manage_users', 'view_users']) as any)(req, res, next);
  return (requirePermission('manage_users') as any)(req, res, next);
}, usersRoutes);
router.use('/customers', viewOrEdit('customers'), customersRoutes);
router.use('/coupons', (req: Request, res: Response, next: NextFunction) =>
  (req.method === 'GET' ? newOrLegacy('view_coupons', 'view_marketing') : newOrLegacy('edit_coupons', 'edit_marketing'))(req, res, next), couponsRoutes);
router.use('/reports', requireAnyPermission(['view_reports', 'view_kpi_sales', 'view_kpi_orders', 'view_kpi_carts', 'view_kpi_users', 'view_kpi_products', 'view_kpi_live', 'view_kpi_advanced']), reportsRoutes);
router.use('/inventory', (req: Request, res: Response, next: NextFunction) =>
  (req.method === 'GET' ? newOrLegacy('view_inventory', 'view_products') : newOrLegacy('adjust_inventory', 'edit_products'))(req, res, next), inventoryRoutes);
router.use('/audit', requirePermission('manage_settings'), auditRoutes);
router.use('/kpi', requireAnyPermission(['view_reports', 'view_kpi_sales', 'view_kpi_orders', 'view_kpi_carts', 'view_kpi_users', 'view_kpi_products', 'view_kpi_live', 'view_kpi_advanced']), kpiAdvancedRoutes);
router.use('/leave', viewOrEdit('orders'), leaveRoutes);
router.use('/tasks', viewOrEdit('orders'), tasksRoutes);
router.use('/team', requireAnyPermission(['view_reports', 'view_kpi_sales', 'view_kpi_orders', 'view_kpi_carts', 'view_kpi_users', 'view_kpi_products', 'view_kpi_live', 'view_kpi_advanced']), teamRoutes);
router.use('/whatsapp', (req: Request, res: Response, next: NextFunction) => {
  if (req.method === 'POST' && req.path === '/incoming') return next();
  return (viewOrEdit('orders') as any)(req, res, next);
}, whatsappRoutes);
router.use('/profit', requireAnyPermission(['view_reports', 'view_kpi_sales', 'view_kpi_orders', 'view_kpi_carts', 'view_kpi_users', 'view_kpi_products', 'view_kpi_live', 'view_kpi_advanced']), profitRoutes);
router.use('/meta', requireAnyPermission(['view_reports', 'view_kpi_sales', 'view_kpi_orders', 'view_kpi_carts', 'view_kpi_users', 'view_kpi_products', 'view_kpi_live', 'view_kpi_advanced']), metaRoutes);
router.use('/couriers', (req: Request, res: Response, next: NextFunction) => {
  if (req.method === 'POST' && req.path === '/steadfast/webhook') return next();
  return (newOrLegacy('view_courier_tracking', 'view_orders') as any)(req, res, next);
}, couriersRoutes);
router.use('/fraud', (req: Request, res: Response, next: NextFunction) =>
  newOrLegacy('view_courier_tracking', 'view_orders')(req, res, next), fraudRoutes);

export default router;
