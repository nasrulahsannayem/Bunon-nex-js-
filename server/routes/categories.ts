import express from 'express';
import { productDbPool } from '../db';

const router = express.Router();
const STORE_URL = 'https://bunonfabrics.com';

const wcFetchCategories = async () => {
  const CK = process.env.WC_KEY || '';
  const CS = process.env.WC_SECRET || '';
  if (!CK || !CS) return null;
  const auth = Buffer.from(CK + ':' + CS).toString('base64');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(STORE_URL + '/wp-json/wc/v3/products/categories?per_page=100&hide_empty=false', {
      headers: { Authorization: 'Basic ' + auth }, signal: ctrl.signal as any
    });
    const ct = (r.headers && r.headers.get ? r.headers.get('content-type') : '') || '';
    if (!r.ok || ct.indexOf('application/json') < 0) return null;
    const j: any = await r.json();
    if (!Array.isArray(j)) return null;
    return j.map((c: any) => ({
      id: c.id, name: c.name, slug: c.slug,
      image: c.image ? c.image.src : null,
      description: c.description || null,
      count: c.count ?? null,
    }));
  } catch { return null; } finally { clearTimeout(timer); }
};

// GET /api/categories — local bunon_categories first, WC fallback
router.get('/', async (_req, res) => {
  try {
    const [rows]: any = await productDbPool.execute(
      'SELECT id, name, slug, parent_id, image, description, menu_order FROM bunon_categories WHERE status = 1 ORDER BY menu_order ASC, id DESC'
    );
    if (rows && rows.length > 0) return res.json({ ok: true, source: 'local', categories: rows });
  } catch (e: any) {
    console.error('[Public Categories] Local error:', e.message);
  }
  const fb = await wcFetchCategories();
  if (fb) return res.json({ ok: true, source: 'wc', categories: fb });
  // Local empty + WC unreachable: return empty (not 503 — Shop falls back to product-derived cats)
  return res.json({ ok: true, source: 'empty', categories: [] });
});

// GET /api/categories/:slug — local first, WC fallback
router.get('/:slug', async (req, res) => {
  try {
    const [rows]: any = await productDbPool.execute(
      'SELECT id, name, slug, parent_id, image, description, menu_order FROM bunon_categories WHERE slug = ? AND status = 1 LIMIT 1',
      [req.params.slug]
    );
    if (rows && rows.length > 0) return res.json({ ok: true, source: 'local', category: rows[0] });
  } catch (e: any) {
    console.error('[Public Categories] Single local error:', e.message);
  }
  const fb = await wcFetchCategories();
  const hit = (fb || []).find((c: any) => String(c.slug) === String(req.params.slug));
  if (hit) return res.json({ ok: true, source: 'wc', category: hit });
  return res.status(404).json({ ok: false, msg: 'Not found' });
});

export default router;
