import express from 'express';
import { productDbPool } from '../../db';
import { requirePermission } from '../../middleware/auth';
import { logAudit, auditCtx } from '../../utils/audit';

const router = express.Router();

type FieldType = 'text' | 'textarea' | 'number' | 'boolean' | 'select' | 'image' | 'password';
interface FieldDef { key: string; label: string; type: FieldType; secret?: boolean; image?: boolean; options?: string[]; default?: string }
interface GroupDef { group: string; label: string; fields: FieldDef[] }

// §7 schema: groups site/social/courier/meta/checkout
const SETTINGS_SCHEMA: GroupDef[] = [
  { group: 'site', label: 'Site', fields: [
    { key: 'site_name', label: 'Site Name', type: 'text', default: 'Bunon Fabrics' },
    { key: 'site_tagline', label: 'Tagline', type: 'text', default: '' },
    { key: 'contact_phone', label: 'Contact Phone', type: 'text', default: '' },
    { key: 'contact_email', label: 'Contact Email', type: 'text', default: '' },
    { key: 'address', label: 'Address', type: 'textarea', default: '' },
    { key: 'logo_url', label: 'Logo', type: 'image', image: true, default: '' },
    { key: 'favicon_url', label: 'Favicon', type: 'image', image: true, default: '' },
  ]},
  { group: 'social', label: 'Social', fields: [
    { key: 'facebook_url', label: 'Facebook URL', type: 'text', default: '' },
    { key: 'instagram_url', label: 'Instagram URL', type: 'text', default: '' },
    { key: 'tiktok_url', label: 'TikTok URL', type: 'text', default: '' },
    { key: 'youtube_url', label: 'YouTube URL', type: 'text', default: '' },
    { key: 'whatsapp_number', label: 'WhatsApp Number', type: 'text', default: '' },
  ]},
  { group: 'courier', label: 'Courier', fields: [
    { key: 'steadfast_status', label: 'Steadfast Status', type: 'select', options: ['on', 'off'], default: 'off' },
    { key: 'steadfast_api_key', label: 'Steadfast API Key', type: 'password', secret: true, default: '' },
    { key: 'steadfast_secret_key', label: 'Steadfast Secret Key', type: 'password', secret: true, default: '' },
    { key: 'steadfast_webhook_secret', label: 'Steadfast Webhook Secret (HMAC কী)', type: 'password', secret: true, default: '' },
    { key: 'pathao_status', label: 'Pathao Status', type: 'select', options: ['on', 'off'], default: 'off' },
    { key: 'pathao_client_id', label: 'Pathao Client ID', type: 'text', default: '' },
    { key: 'pathao_client_secret', label: 'Pathao Client Secret', type: 'password', secret: true, default: '' },
    { key: 'pathao_access_token', label: 'Pathao Access Token', type: 'password', secret: true, default: '' },
    { key: 'redx_status', label: 'RedX Status', type: 'select', options: ['on', 'off'], default: 'off' },
    { key: 'redx_api_token', label: 'RedX API Token', type: 'password', secret: true, default: '' },
  ]},
  { group: 'meta', label: 'Meta', fields: [
    { key: 'meta_pixel_id', label: 'Pixel ID', type: 'text', default: '' },
    { key: 'meta_capi_token', label: 'CAPI Token', type: 'password', secret: true, default: '' },
    { key: 'meta_page_id', label: 'Page ID', type: 'text', default: '' },
    { key: 'meta_app_secret', label: 'App Secret', type: 'password', secret: true, default: '' },
  ]},
  { group: 'checkout', label: 'Checkout', fields: [
    { key: 'cod_enabled', label: 'COD Enabled', type: 'boolean', default: 'true' },
    { key: 'cod_charge_inside', label: 'COD Charge (Inside Dhaka)', type: 'number', default: '60' },
    { key: 'cod_charge_outside', label: 'COD Charge (Outside Dhaka)', type: 'number', default: '120' },
    { key: 'free_shipping_threshold', label: 'Free Shipping Threshold', type: 'number', default: '0' },
    { key: 'min_order_amount', label: 'Minimum Order Amount', type: 'number', default: '0' },
    { key: 'announcement_text', label: 'Announcement Bar', type: 'text', default: '' },
    { key: 'bkash_number', label: 'bKash Number', type: 'text', default: '' },
    { key: 'nagad_number', label: 'Nagad Number', type: 'text', default: '' },
  ]},
  { group: 'eman', label: 'Eman Keys (ইমান কী)', fields: [
    { key: 'hoorin_api_key', label: 'Hoorin API Key (হুরিন কী)', type: 'password', secret: true, default: '' },
    { key: 'bkash_username', label: 'bKash Username (বিকাশ ইউজারনেম)', type: 'password', secret: true, default: '' },
    { key: 'bkash_password', label: 'bKash Password (বিকাশ পাসওয়ার্ড)', type: 'password', secret: true, default: '' },
    { key: 'bkash_app_key', label: 'bKash App Key (বিকাশ অ্যাপ কী)', type: 'password', secret: true, default: '' },
    { key: 'bkash_app_secret', label: 'bKash App Secret (বিকাশ অ্যাপ সিক্রেট)', type: 'password', secret: true, default: '' },
  ]},
];

const ALLOWED_KEYS = new Set(SETTINGS_SCHEMA.flatMap((g) => g.fields.map((f) => f.key)));
const DEFAULTS: Record<string, string> = {};
for (const g of SETTINGS_SCHEMA) for (const f of g.fields) DEFAULTS[f.key] = f.default ?? '';

const isSecretKey = (key: string) => /key|secret|token|password|username/i.test(key);

const initSettingsTable = async () => {
  await productDbPool.execute(
    'CREATE TABLE IF NOT EXISTS bunon_settings (setting_key VARCHAR(100) PRIMARY KEY, setting_value TEXT, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)'
  );
};
initSettingsTable();

// GET /api/admin/settings/schema — grouped field definitions for frontend
router.get('/schema', async (_req, res) => {
  res.json({ ok: true, schema: SETTINGS_SCHEMA });
});

// GET /api/admin/settings — seeded defaults + secret masking
router.get('/', async (_req, res) => {
  try {
    const [rows]: any = await productDbPool.execute('SELECT setting_key, setting_value FROM bunon_settings');
    const stored = rows.reduce((acc: any, row: any) => {
      acc[row.setting_key] = row.setting_value;
      return acc;
    }, {});
    const settings: Record<string, string> = { ...DEFAULTS, ...stored };
    for (const k of Object.keys(settings)) {
      if (isSecretKey(k) && settings[k]) settings[k] = '***';
    }
    res.json({ ok: true, settings });
  } catch (error: any) {
    res.status(500).json({ ok: false, msg: 'Error fetching settings' });
  }
});

// PUT /api/admin/settings — allowlist validation, skip masked secrets
// RBAC via requirePermission('settings','edit') -> manage_settings (no bespoke role check).
router.put('/', requirePermission('settings', 'edit'), async (req, res) => {
  try {
    const settings = req.body;
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      return res.status(400).json({ ok: false, msg: 'Invalid settings payload' });
    }
    const unknown = Object.keys(settings).filter((k) => !ALLOWED_KEYS.has(k));
    if (unknown.length) {
      return res.status(400).json({ ok: false, msg: 'Unknown setting keys: ' + unknown.join(', ') });
    }
    // Skip masked secrets so stored secrets are preserved
    const entries = Object.entries(settings).filter(([k, v]) => !(isSecretKey(k) && v === '***'));
    for (const [key, value] of entries) {
      const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
      await productDbPool.query(
        'INSERT INTO bunon_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = ?',
        [key, stringValue, stringValue]
      );
    }
    res.json({ ok: true, msg: 'Settings updated successfully' });
    void logAudit({ ...auditCtx(req), action: 'settings_update', module: 'settings', detail: Object.keys(settings || {}).join(',') });
  } catch (error: any) {
    res.status(500).json({ ok: false, msg: 'Error updating settings' });
  }
});

// GET /api/admin/settings/:key - single-key fetch; real value ONLY with ?reveal=1, else masked.
// Mount gates auth + manage_settings; explicit check + audit below, key only, never value.
router.get('/:key', requirePermission('manage_settings'), async (req, res) => {
  try {
    const user: any = (req as any).user;
    if (!user) return res.status(401).json({ ok: false, msg: 'No token provided' });
    const key = String(req.params.key || '');
    if (!key || !ALLOWED_KEYS.has(key)) {
      return res.status(404).json({ ok: false, msg: 'Unknown setting key' });
    }
    const reveal = String(req.query.reveal || '') === '1';
    const [rows]: any = await productDbPool.execute('SELECT setting_value FROM bunon_settings WHERE setting_key = ? LIMIT 1', [key]);
    const stored = rows && rows[0] ? String(rows[0].setting_value ?? '') : undefined;
    const value = stored !== undefined ? stored : (DEFAULTS[key] ?? '');
    void logAudit({ ...auditCtx(req), action: 'settings_reveal', module: 'settings', detail: key + (reveal ? ':reveal' : ':masked') });
    if (reveal) return res.json({ ok: true, key, value });
    return res.json({ ok: true, key, value: value ? '***' : value });
  } catch (error: any) {
    return res.status(500).json({ ok: false, msg: 'Error fetching setting' });
  }
});

export default router;
