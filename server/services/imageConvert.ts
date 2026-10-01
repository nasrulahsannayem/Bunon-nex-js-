// On-upload image optimisation for bunon.shop.
//
// SCOPE (deliberately narrow — this is Phase 3B step 1):
//   * It runs ONLY on files uploaded through POST /api/admin/media/upload.
//   * It NEVER touches any image already on disk. The 746 pre-existing
//     product photos are not read, moved, rewritten or deleted by this module.
//     Backfilling them is a separate, explicitly-approved batch job.
//
// SAFETY MODEL — why the original is kept:
//   The converted .webp is written as a NEW sibling file. The uploaded original
//   is left exactly where multer put it. The API returns the .webp URL so new
//   products use the small file, but nothing is destroyed: if conversion ever
//   fails, or a human needs the untouched original, it is still on disk.
//   The upload path pattern (public/uploads/YYYY/MM/<timestamp>-<name>) is
//   unchanged, so every existing DB row, Meta catalog entry and cached URL
//   remains valid.
//
// ENCODER CAVEAT (measured on this host, do not "fix" this by changing quality):
//   This box runs ImageMagick 6 with libwebp 1.3.2, whose encoder CLAMPS the
//   -quality flag: -quality 10 and -quality 95 both produce byte-identical
//   output (135680 bytes on the reference photo); only -quality 100 differs,
//   which switches to a much larger near-lossless encode. The knob that
//   actually changes size/quality here is -define webp:method (0..6).
//   Measured on a 3072x4608 product photo downscaled to 1600px:
//     method=0 -> 183068 B   PSNR 34.27
//     method=2 -> 141144 B   PSNR 34.24
//     method=4 -> 135680 B   PSNR 34.42   <-- chosen
//     method=6 -> 130358 B   PSNR 34.30
//   PSNR > 32 dB is visually lossless for product photography. method=4 gives
//   the best PSNR/size ratio at ~0.09 s per image.

import { execFile } from "child_process";
import fs from "fs";
import path from "path";

const CONVERT_BIN = "/usr/bin/convert";

// Max edge length in pixels. Products are shown in a grid and a lightbox; 1600
// is comfortably above the largest rendered size and is what keeps a 7.7 MB
// phone photo down to ~130 KB.
const MAX_EDGE = 1600;
const WEBP_METHOD = 4;
const QUALITY = 80;

// Hard ceiling on a single conversion. The largest image on the server converts
// in ~0.9 s using ~177 MB RSS; the box has ~6.9 GB free RAM, so a 60 s timeout
// is a safety net, not a performance budget.
const TIMEOUT_MS = 60_000;

// Only these are worth converting. SVG and GIF are left alone: SVG is vector
// (re-encoding would rasterise it) and an animated GIF would be flattened to a
// single frame, silently losing animation.
const CONVERTIBLE = new Set([
  ".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff", ".heic", ".heif",
]);

export interface ConvertResult {
  /** Path of the generated .webp, or null if nothing was produced. */
  webpPath: string | null;
  /** Bytes saved vs the original, 0 when no conversion happened. */
  savedBytes: number;
  originalBytes: number;
  /** Human-readable reason when webpPath is null. */
  skipped?: string;
}

function runConvert(args: string[]): Promise<{ ok: boolean; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      CONVERT_BIN,
      args,
      { timeout: TIMEOUT_MS, maxBuffer: 1024 * 1024 },
      (err, _stdout, stderr) => {
        if (err) return resolve({ ok: false, stderr: String(stderr || err.message) });
        resolve({ ok: true, stderr: String(stderr || "") });
      }
    );
  });
}

/**
 * A file is a real WebP only if it starts with a RIFF container whose form
 * type is WEBP. convert can exit 0 and still leave a truncated file when it
 * runs out of resources, so existence alone is not proof.
 */
function isValidWebp(file: string): boolean {
  try {
    const fd = fs.openSync(file, "r");
    const buf = Buffer.alloc(12);
    fs.readSync(fd, buf, 0, 12, 0);
    fs.closeSync(fd);
    return buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP";
  } catch {
    return false;
  }
}

/**
 * Convert `srcPath` to a sibling .webp. Never throws, never deletes the
 * source. Returns skipped reasons instead so the caller can log them.
 */
export async function convertToWebp(srcPath: string): Promise<ConvertResult> {
  const originalBytes = (() => {
    try { return fs.statSync(srcPath).size; } catch { return 0; }
  })();

  const ext = path.extname(srcPath).toLowerCase();
  if (!CONVERTIBLE.has(ext)) {
    return { webpPath: null, savedBytes: 0, originalBytes, skipped: `extension ${ext} not convertible` };
  }

  const dest = path.join(
    path.dirname(srcPath),
    path.basename(srcPath, path.extname(srcPath)) + ".webp"
  );

  // Never clobber an existing file, and never convert a .webp into a .webp.
  if (dest === srcPath) {
    return { webpPath: null, savedBytes: 0, originalBytes, skipped: "source already webp" };
  }
  if (fs.existsSync(dest)) {
    return { webpPath: null, savedBytes: 0, originalBytes, skipped: "destination already exists" };
  }

  const res = await runConvert([
    srcPath,
    "-auto-orient",            // honour EXIF rotation before stripping metadata
    "-resize", `${MAX_EDGE}x${MAX_EDGE}>`,
    "-strip",                  // drop EXIF/IPTC: smaller, and strips GPS
    "-quality", String(QUALITY),
    "-define", `webp:method=${WEBP_METHOD}`,
    dest,
  ]);

  if (!res.ok) {
    try { if (fs.existsSync(dest)) fs.unlinkSync(dest); } catch {}
    return { webpPath: null, savedBytes: 0, originalBytes, skipped: `convert failed: ${res.stderr.slice(0, 200)}` };
  }
  if (!isValidWebp(dest)) {
    try { fs.unlinkSync(dest); } catch {}
    return { webpPath: null, savedBytes: 0, originalBytes, skipped: "output was not a valid webp" };
  }

  const webpBytes = fs.statSync(dest).size;

  // If WebP came out LARGER (tiny/flat images can), keep using the original —
  // a bigger file would slow the site for no benefit.
  if (webpBytes >= originalBytes) {
    try { fs.unlinkSync(dest); } catch {}
    return { webpPath: null, savedBytes: 0, originalBytes, skipped: "webp was not smaller than original" };
  }

  return { webpPath: dest, savedBytes: originalBytes - webpBytes, originalBytes };
}
