import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { convertToWebp } from "../../services/imageConvert";

const router = express.Router();

const UPLOAD_ROOT = path.join(process.cwd(), "public", "uploads");

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const d = new Date();
    const dir = path.join(
      UPLOAD_ROOT,
      String(d.getFullYear()),
      String(d.getMonth() + 1).padStart(2, "0")
    );
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]+/g, "_");
    cb(null, Date.now() + "-" + safe);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files allowed"));
  },
});

// POST /api/admin/media/upload — single image, 5MB limit
// Accepts field "file" (ProductsManager/UsersRolesManager) OR "image" (ImagePicker).
//
// WebP: after multer stores the file we generate a .webp sibling and return
// THAT url, so newly uploaded product photos are modern + light automatically.
// The uploaded original is deliberately left on disk (see services/imageConvert),
// so this is additive only — nothing existing is read, moved or deleted.
router.post("/upload", upload.fields([{ name: "file", maxCount: 1 }, { name: "image", maxCount: 1 }]), async (req, res) => {
  try {
    const f = (req.files as any)?.file?.[0] ?? (req.files as any)?.image?.[0] ?? (req as any).file;
    if (!f) return res.status(400).json({ ok: false, msg: "file required" });

    const publicRoot = path.join(process.cwd(), "public");
    const toUrl = (abs: string) =>
      "/" + path.relative(publicRoot, abs).split(path.sep).join("/");

    let servePath = f.path;
    let webpInfo: Record<string, unknown> = {};

    try {
      const r = await convertToWebp(f.path);
      if (r.webpPath) {
        servePath = r.webpPath;
        webpInfo = {
          converted: true,
          originalName: f.filename,
          originalSize: r.originalBytes,
          webpSize: r.originalBytes - r.savedBytes,
          savedBytes: r.savedBytes,
        };
        console.log(
          `[Admin Media] WebP ${f.filename}: ${(r.originalBytes / 1024).toFixed(0)}KB -> ` +
          `${((r.originalBytes - r.savedBytes) / 1024).toFixed(0)}KB ` +
          `(saved ${(r.savedBytes / 1024).toFixed(0)}KB)`
        );
      } else {
        // Never fail an upload because optimisation could not run.
        webpInfo = { converted: false, reason: r.skipped };
        console.log(`[Admin Media] WebP skipped for ${f.filename}: ${r.skipped}`);
      }
    } catch (ce: any) {
      webpInfo = { converted: false, reason: "converter error: " + ce?.message };
      console.error("[Admin Media] WebP converter error:", ce?.message);
    }

    res.json({
      ok: true,
      url: toUrl(servePath),
      name: path.basename(servePath),
      webp: webpInfo,
    });
  } catch (e: any) {
    console.error("[Admin Media] Upload error:", e.message);
    res.status(500).json({ ok: false, msg: "Server error" });
  }
});

// GET /api/admin/media — paginated list
router.get("/", (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 24));
    const all: { url: string; name: string; size: number; mtime: string }[] = [];
    const walk = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) walk(full);
        else {
          const st = fs.statSync(full);
          const rel = path.relative(path.join(process.cwd(), "public"), full);
          all.push({
            url: "/" + rel.split(path.sep).join("/"),
            name: ent.name,
            size: st.size,
            mtime: st.mtime.toISOString(),
          });
        }
      }
    };
    walk(UPLOAD_ROOT);
    all.sort((a, b) => (a.mtime < b.mtime ? 1 : -1));
    const total = all.length;
    const files = all.slice((page - 1) * limit, page * limit);
    res.json({ ok: true, files, total, page, limit });
  } catch (e: any) {
    console.error("[Admin Media] List error:", e.message);
    res.status(500).json({ ok: false, msg: "Server error" });
  }
});

// DELETE /api/admin/media/:name — confined to uploads dir
router.delete("/:name", (req, res) => {
  try {
    const raw = req.params.name;
    const target = path.resolve(UPLOAD_ROOT, raw);
    if (!target.startsWith(path.resolve(UPLOAD_ROOT) + path.sep))
      return res.status(400).json({ ok: false, msg: "Invalid path" });
    if (!fs.existsSync(target) || !fs.statSync(target).isFile())
      return res.status(404).json({ ok: false, msg: "File not found" });
    fs.unlinkSync(target);
    res.json({ ok: true });
  } catch (e: any) {
    console.error("[Admin Media] Delete error:", e.message);
    res.status(500).json({ ok: false, msg: "Server error" });
  }
});

export default router;
