const fs = require('fs');
const path = require('path');
const https = require('https');

const urls = [
  "https://bunonfabrics.com/wp-content/uploads/woocommerce-placeholder-300x300.webp",
  "https://bunonfabrics.com/wp-content/uploads/2025/02/IMG-20250224-WA0007.jpg",
  "https://bunonfabrics.com/wp-content/uploads/2025/02/676afc30-c94c-407d-984d-e19845b088ec.jpeg",
  "https://bunonfabrics.com/wp-content/uploads/2025/03/IMG-20250301-WA0005.jpg",
  "https://bunonfabrics.com/wp-content/uploads/2025/04/475526699_18022258898644312_3512043635408462093_n.webp",
  "https://bunonfabrics.com/wp-content/uploads/2025/06/Bestselling-Saree-banner-1pc.jpg",
  "https://bunonfabrics.com/wp-content/uploads/2026/04/snaptik_7543269370093456658_v3-1.mp4",
  "https://bunonfabrics.com/wp-content/uploads/2025/10/bunon-saree-banner-6.webp",
  "https://bunonfabrics.com/wp-content/uploads/2025/02/original-logo-with-black-background.png",
  "https://bunonfabrics.com/wp-content/uploads/2025/03/Payment-1-1024x98-1-1.png",
  "https://bunonfabrics.com/wp-content/uploads/2025/06/Bestselling-Saree-banner-1-mobie.jpg",
  "https://bunonfabrics.com/wp-content/uploads/2025/06/product-jpeg-1000x1000-1.jpg",
  "https://bunonfabrics.com/wp-content/uploads/2025/10/bunon-saree-banner-4.webp",
  "https://bunonfabrics.com/wp-content/uploads/2025/03/couple-dress.webp",
  "https://bunonfabrics.com/wp-content/uploads/2025/03/saree.jpg"
];

const imgDir = path.join(__dirname, 'public', 'assets', 'images');
const vidDir = path.join(__dirname, 'public', 'assets', 'videos');

if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });
if (!fs.existsSync(vidDir)) fs.mkdirSync(vidDir, { recursive: true });

async function downloadFile(url) {
  return new Promise((resolve, reject) => {
    const filename = path.basename(new URL(url).pathname);
    const isVideo = url.endsWith('.mp4');
    const dest = path.join(isVideo ? vidDir : imgDir, filename);

    if (fs.existsSync(dest)) {
      console.log(`Already exists: ${filename}`);
      return resolve(dest);
    }

    const file = fs.createWriteStream(dest);
    https.get(url, { rejectUnauthorized: false }, (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        console.log(`Downloaded: ${filename}`);
        resolve(dest);
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      console.error(`Error downloading ${filename}: ${err.message}`);
      reject(err);
    });
  });
}

async function main() {
  for (const url of urls) {
    await downloadFile(url);
  }
  console.log("All downloads completed!");
}

main();
