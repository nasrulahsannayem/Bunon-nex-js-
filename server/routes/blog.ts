import express from 'express';
import { productDbPool } from '../db';

const router = express.Router();
const STORE_URL = 'https://bunonfabrics.com';

// WC/WP fallback: public WP posts endpoint (no auth needed)
const wpFetchPosts = async (slug?: string) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const url = slug
      ? STORE_URL + '/wp-json/wp/v2/posts?slug=' + encodeURIComponent(slug)
      : STORE_URL + '/wp-json/wp/v2/posts?per_page=20&_fields=id,slug,title,excerpt,content,featured_media,author,date';
    const r = await fetch(url, { signal: ctrl.signal as any });
    const ct = (r.headers && r.headers.get ? r.headers.get('content-type') : '') || '';
    if (!r.ok || ct.indexOf('application/json') < 0) return null;
    const j: any = await r.json();
    if (!Array.isArray(j)) return null;
    const strip = (h: string) => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return j.map((p: any) => ({
      id: p.id,
      title: typeof p.title === 'object' ? p.title.rendered : p.title,
      slug: p.slug,
      excerpt: strip(typeof p.excerpt === 'object' ? p.excerpt.rendered : p.excerpt),
      content: typeof p.content === 'object' ? p.content.rendered : (p.content || null),
      featured_image: p.featured_media_src_url || null,
      author: null,
      tags: null,
      published_at: p.date || null,
    }));
  } catch { return null; } finally { clearTimeout(timer); }
};

// GET /api/blog - local bunon_blogs first, WP fallback
router.get('/', async (_req, res) => {
  try {
    const [rows]: any = await productDbPool.execute(
      'SELECT id, title, slug, excerpt, featured_image, author, tags, published_at FROM bunon_blogs WHERE status = 1 ORDER BY published_at DESC, id DESC'
    );
    if (rows && rows.length > 0) return res.json({ ok: true, source: 'local', blogs: rows });
  } catch (e: any) {
    console.error('[Public Blog] Local error:', e.message);
  }
  const fb = await wpFetchPosts();
  if (fb) return res.json({ ok: true, source: 'wc', blogs: fb });
  return res.json({ ok: true, source: 'empty', blogs: [] });
});

// GET /api/blog/:slug - local first, WP fallback
router.get('/:slug', async (req, res) => {
  try {
    const [rows]: any = await productDbPool.execute(
      'SELECT id, title, slug, excerpt, content, featured_image, author, tags, published_at FROM bunon_blogs WHERE slug = ? AND status = 1 LIMIT 1',
      [req.params.slug]
    );
    if (rows && rows.length > 0) return res.json({ ok: true, source: 'local', blog: rows[0] });
  } catch (e: any) {
    console.error('[Public Blog] Single local error:', e.message);
  }
  const fb = await wpFetchPosts(req.params.slug);
  if (fb && fb.length > 0) return res.json({ ok: true, source: 'wc', blog: fb[0] });
  return res.status(404).json({ ok: false, msg: 'Not found' });
});

export default router;
