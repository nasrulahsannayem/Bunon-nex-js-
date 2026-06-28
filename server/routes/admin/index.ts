import express from 'express';
import { verifyAdmin } from '../../middleware/auth';

import marketingRoutes from './marketing';
import ordersRoutes from './orders';
import statsRoutes from './stats';
import productsRoutes from './products'; // I will create this next
import settingsRoutes from './settings'; // I will create this next

const router = express.Router();

// Apply verifyAdmin middleware to ALL admin routes
router.use(verifyAdmin);

router.use('/marketing', marketingRoutes);
router.use('/orders', ordersRoutes);
router.use('/stats', statsRoutes);
router.use('/products', productsRoutes);
router.use('/settings', settingsRoutes);

export default router;
