import express from 'express';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import https from 'https';

const router = express.Router();

// Local cache directory for product images
const CACHE_DIR = path.join(process.cwd(), 'image', 'cache');

// Ensure the cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

router.get('/image-proxy', async (req, res) => {
  const imageUrl = req.query.url ? String(req.query.url) : '';

  if (!imageUrl) {
    return res.status(400).send('Image URL is required');
  }

  // Create a unique hash/filename based on the URL to store locally
  const urlHash = crypto.createHash('md5').update(imageUrl).digest('hex');
  const extension = path.extname(new URL(imageUrl).pathname) || '.jpg';
  const localFileName = `${urlHash}${extension}`;
  const localFilePath = path.join(CACHE_DIR, localFileName);

  // 1. If image already cached, serve it directly
  if (fs.existsSync(localFilePath)) {
    try {
      const stats = fs.statSync(localFilePath);
      // Determine content type based on extension
      let contentType = 'image/jpeg';
      if (extension === '.png') contentType = 'image/png';
      else if (extension === '.gif') contentType = 'image/gif';
      else if (extension === '.webp') contentType = 'image/webp';

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', stats.size);
      res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1 Year Browser Cache
      return fs.createReadStream(localFilePath).pipe(res);
    } catch (err) {
      console.error('Error serving local cached image:', err);
    }
  }

  // 2. If not cached, download from source URL and cache it
  try {
    const response = await axios({
      url: imageUrl,
      method: 'GET',
      responseType: 'stream',
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      },
      httpsAgent: new https.Agent({ rejectUnauthorized: false })
    });

    const writer = fs.createWriteStream(localFilePath);
    response.data.pipe(writer);

    writer.on('finish', () => {
      // Serve the freshly saved file
      let contentType: string = String(response.headers['content-type'] || 'image/jpeg');
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=31536000');
      fs.createReadStream(localFilePath).pipe(res);
    });

    writer.on('error', (err) => {
      console.error('Error writing image to disk:', err);
      // Fallback: pipe directly to response if file save fails
      response.data.pipe(res);
    });

  } catch (error: any) {
    console.error(`Failed to download/cache image: ${imageUrl}. Error: ${error.message}`);
    // If the source site is down and not cached, try to send a default fallback placeholder
    res.status(502).send('Failed to retrieve image');
  }
});

export default router;
