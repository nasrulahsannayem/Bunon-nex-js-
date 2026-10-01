import express from 'express';
import { productDbPool } from '../../db';

const router = express.Router();

// GET /api/admin/categories
router.get('/', async (req, res) => {
  try {
    const [rows]: any = await productDbPool.execute(
      `SELECT id, name, slug, parent_id, image, description, menu_order, status, created_at
       FROM bunon_categories ORDER BY menu_order ASC, id DESC`
    );
    res.json({ ok: true, categories: rows });
  } catch (e: any) {
    console.error('[Admin Categories] List error:', e.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

// POST /api/admin/categories
router.post('/', async (req, res) => {
  try {
    const { name, slug, parent_id, image, description, menu_order, status } = req.body || {};
    if (!name) return res.status(400).json({ ok: false, msg: 'name required' });
    const finalSlug = (slug || name).toString().toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const [r]: any = await productDbPool.execute(
      `INSERT INTO bunon_categories (name, slug, parent_id, image, description, menu_order, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, finalSlug, parent_id ?? null, image ?? null, description ?? null, menu_order ?? 0, status ?? 1]
    );
    res.json({ ok: true, id: r.insertId });
  } catch (e: any) {
    console.error('[Admin Categories] Create error:', e.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

// PUT /api/admin/categories/:id — only keys present in body are touched,
// so explicit null clears a field (parent_id/image/description null-clear)
router.put('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const b = req.body || {};
    const sets: string[] = [];
    const params: any[] = [];
    const put = (col: string, val: any) => { sets.push(col + ' = ?'); params.push(val); };
    if ('name' in b) put('name', b.name);
    if ('slug' in b && b.slug) {
      put('slug', b.slug.toString().toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''));
    }
    if ('parent_id' in b) put('parent_id', b.parent_id == null || b.parent_id === '' ? null : Number(b.parent_id));
    if ('image' in b) put('image', b.image ? b.image : null);
    if ('description' in b) put('description', b.description ? b.description : null);
    if ('menu_order' in b) put('menu_order', Number(b.menu_order) || 0);
    if ('status' in b) put('status', Number(b.status));
    if (!sets.length) return res.json({ ok: true, noop: true });
    params.push(id);
    const [r]: any = await productDbPool.execute(
      'UPDATE bunon_categories SET ' + sets.join(', ') + ' WHERE id = ?',
      params
    );
    if ((r as any).affectedRows === 0) return res.status(404).json({ ok: false, msg: 'Category not found' });
    res.json({ ok: true });
  } catch (e: any) {
    console.error('[Admin Categories] Update error:', e.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

// DELETE /api/admin/categories/:id
router.delete('/:id', async (req, res) => {
  try {
    await productDbPool.execute(`DELETE FROM bunon_categories WHERE id = ?`, [req.params.id]);
    res.json({ ok: true });
  } catch (e: any) {
    console.error('[Admin Categories] Delete error:', e.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

export default router;
