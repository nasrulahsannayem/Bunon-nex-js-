import { Request, Response, Router } from 'express';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const router = Router();

/**
 * Product thumbnail service.
 *
 * Before this, the admin product table rendered 44x44 thumbnails by loading the
 * FULL original image (measured 40 KB - 646 KB each; 20 products = 3.3 MB).
 * `sharp` generates and disk-caches a real small thumbnail, so a table page
 * costs a few KB per row instead of a few hundred.
 *
 * Cache: public/uploads/thumbs/<w>x<h>/<name>-<hash>.webp, immutable (1 year).
 * Regeneration is automatic if the source file changes (hash of mtime+size).
 */

const UPLOADS = path.join(process.cwd(), 'public', 'uploads');
const IMAGE_DIR = path.join(process.cwd(), 'public', 'image');
const THUMB_DIR = path.join(UPLOADS, 'thumbs');
// FIX-5b: source resolution must use public/ as the URL root.

const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);

function safeSegment(s: string): string | null {
  if (!s) return null;
  // Reject traversal and anything not a plain path piece.
  if (s.includes('..') || s.includes('\0') || s.startsWith('/')) return null;
  return s;
}

/** Resolve a public image URL (e.g. /uploads/products/667/1_x.jpg) to a real file. */
function resolveSource(urlPath: string): string | null {
  const clean = String(urlPath || '').split('?')[0];
  const rel = safeSegment(clean.startsWith('/') ? clean.slice(1) : clean);
  if (!rel) return null;

  // Public URLs are served from public/ (nginx and express.static both map
  // /uploads -> public/uploads), so the on-disk root is public/, not the
  // project root.
  const PUBLIC = path.join(process.cwd(), 'public');
  const roots = rel.startsWith('uploads/')
    ? [PUBLIC, process.cwd()]
    : rel.startsWith('image/')
      ? [PUBLIC, IMAGE_DIR, process.cwd()]
      : [process.cwd(), PUBLIC];

  const ext = path.extname(rel).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) return null;

  for (const root of roots) {
    const abs = path.resolve(root, rel);
    // Never escape the project root.
    if (!abs.startsWith(process.cwd())) continue;
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return abs;
  }
  return null;
}

// GET /thumbs/:w/:h?src=<encoded public path>
router.get('/thumbs/:w/:h', async (req: Request, res: Response) => {
  const w = Math.min(Math.max(parseInt(String(req.params.w), 10) || 200, 16), 800);
  const h = Math.min(Math.max(parseInt(String(req.params.h), 10) || 200, 16), 800);
  const src = String(req.query.src || '');

  const abs = resolveSource(src);
  if (!abs) {
    return res.status(404).type('text/plain').send('not found');
  }

  try {
    const st = fs.statSync(abs);
    // Change the cache key whenever the source file changes.
    const key = `${st.mtimeMs.toString(36)}-${st.size.toString(36)}`;
    const base = path.basename(abs, path.extname(abs)).replace(/[^A-Za-z0-9._-]/g, '_').slice(-60);
    const outDir = path.join(THUMB_DIR, `${w}x${h}`);
    const outFile = path.join(outDir, `${base}-${key}.webp`);

    if (fs.existsSync(outFile)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.type('image/webp');
      return res.sendFile(outFile);
    }

    const buf = await sharp(abs, { failOn: 'none' })
      .rotate()                        // respect EXIF orientation
      .resize(w, h, { fit: 'cover', position: 'centre', withoutEnlargement: true })
      .webp({ quality: 76, effort: 4 })
      .toBuffer();

    fs.mkdirSync(outDir, { recursive: true });
    // Write to a temp name then rename, so concurrent requests never read a
    // half-written file.
    const tmp = outFile + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, outFile);

    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.type('image/webp');
    return res.send(buf);
  } catch (e: any) {
    console.error('[thumbs] failed for', src, e?.message);
    return res.status(404).type('text/plain').send('not found');
  }
});

export default router;