import express from 'express';
import { productDbPool } from '../../db';

const router = express.Router();

// GET /api/admin/blogs
router.get('/', async (req, res) => {
  try {
    const [rows]: any = await productDbPool.execute(
      `SELECT id, title, slug, excerpt, featured_image, author, tags, status, published_at, created_at
       FROM bunon_blogs ORDER BY id DESC`
    );
    res.json({ ok: true, blogs: rows });
  } catch (e: any) {
    console.error('[Admin Blogs] List error:', e.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

// POST /api/admin/blogs
router.post('/', async (req, res) => {
  try {
    const { title, slug, excerpt, content, featured_image, author, tags, status, published_at } = req.body || {};
    if (!title) return res.status(400).json({ ok: false, msg: 'title required' });
    const finalSlug = (slug || title).toString().toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const tagStr = typeof tags === 'string' ? tags : (tags ? JSON.stringify(tags) : null);
    const [r]: any = await productDbPool.execute(
      `INSERT INTO bunon_blogs (title, slug, excerpt, content, featured_image, author, tags, status, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [title, finalSlug, excerpt ?? null, content ?? null, featured_image ?? null, author ?? null, tagStr, status ?? 1, published_at ?? null]
    );
    res.json({ ok: true, id: r.insertId });
  } catch (e: any) {
    console.error('[Admin Blogs] Create error:', e.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

// PUT /api/admin/blogs/:id
router.put('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const { title, slug, excerpt, content, featured_image, author, tags, status, published_at } = req.body || {};
    const finalSlug = slug ? slug.toString().toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') : undefined;
    const tagStr = typeof tags === 'string' ? tags : (tags ? JSON.stringify(tags) : undefined);
    await productDbPool.execute(
      `UPDATE bunon_blogs SET
         title = COALESCE(?, title),
         slug = COALESCE(?, slug),
         excerpt = COALESCE(?, excerpt),
         content = COALESCE(?, content),
         featured_image = COALESCE(?, featured_image),
         author = COALESCE(?, author),
         tags = COALESCE(?, tags),
         status = COALESCE(?, status),
         published_at = COALESCE(?, published_at)
       WHERE id = ?`,
      [title ?? null, finalSlug ?? null, excerpt ?? null, content ?? null, featured_image ?? null, author ?? null, tagStr ?? null, status ?? null, published_at ?? null, id]
    );
    res.json({ ok: true });
  } catch (e: any) {
    console.error('[Admin Blogs] Update error:', e.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

// DELETE /api/admin/blogs/:id
router.delete('/:id', async (req, res) => {
  try {
    await productDbPool.execute(`DELETE FROM bunon_blogs WHERE id = ?`, [req.params.id]);
    res.json({ ok: true });
  } catch (e: any) {
    console.error('[Admin Blogs] Delete error:', e.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

export default router;
