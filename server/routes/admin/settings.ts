import express from 'express';
import { productDbPool } from '../../db';

const router = express.Router();

// Helper to initialize table if it doesn't exist
const initSettingsTable = async () => {
  await productDbPool.execute(`
    CREATE TABLE IF NOT EXISTS bunon_settings (
      setting_key VARCHAR(100) PRIMARY KEY,
      setting_value TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
};
initSettingsTable();

// GET /api/admin/settings
router.get('/', async (req, res) => {
  try {
    const [rows]: any = await productDbPool.execute(`SELECT setting_key, setting_value FROM bunon_settings`);
    const settings = rows.reduce((acc: any, row: any) => {
      acc[row.setting_key] = row.setting_value;
      return acc;
    }, {});
    res.json({ ok: true, settings });
  } catch (error: any) {
    console.error('[Admin API] Settings GET Error:', error.message);
    res.status(500).json({ ok: false, msg: 'Error fetching settings' });
  }
});

// PUT /api/admin/settings
router.put('/', async (req, res) => {
  try {
    const settings = req.body;
    
    // Only Super Admin can update settings
    if ((req as any).user?.role !== 'super_admin' && (req as any).user?.role !== 'admin') {
      return res.status(403).json({ ok: false, msg: 'Only Super Admins can modify settings' });
    }

    const queries = Object.entries(settings).map(async ([key, value]) => {
      const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
      await productDbPool.query(
        'INSERT INTO bunon_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = ?',
        [key, stringValue, stringValue]
      );
    });

    await Promise.all(queries);

    res.json({ ok: true, msg: 'Settings updated successfully' });
  } catch (error: any) {
    console.error('[Admin API] Settings PUT Error:', error.message);
    res.status(500).json({ ok: false, msg: 'Error updating settings' });
  }
});

export default router;
