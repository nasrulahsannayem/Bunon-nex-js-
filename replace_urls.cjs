const fs = require('fs');
const path = require('path');

const urlMap = {
  "https://bunonfabrics.com/wp-content/uploads/woocommerce-placeholder-300x300.webp": "/assets/images/woocommerce-placeholder-300x300.webp",
  "https://bunonfabrics.com/wp-content/uploads/2025/02/IMG-20250224-WA0007.jpg": "/assets/images/IMG-20250224-WA0007.jpg",
  "https://bunonfabrics.com/wp-content/uploads/2025/02/676afc30-c94c-407d-984d-e19845b088ec.jpeg": "/assets/images/676afc30-c94c-407d-984d-e19845b088ec.jpeg",
  "https://bunonfabrics.com/wp-content/uploads/2025/03/IMG-20250301-WA0005.jpg": "/assets/images/IMG-20250301-WA0005.jpg",
  "https://bunonfabrics.com/wp-content/uploads/2025/04/475526699_18022258898644312_3512043635408462093_n.webp": "/assets/images/475526699_18022258898644312_3512043635408462093_n.webp",
  "https://bunonfabrics.com/wp-content/uploads/2025/06/Bestselling-Saree-banner-1pc.jpg": "/assets/images/Bestselling-Saree-banner-1pc.jpg",
  "https://bunonfabrics.com/wp-content/uploads/2026/04/snaptik_7543269370093456658_v3-1.mp4": "/assets/videos/snaptik_7543269370093456658_v3-1.mp4",
  "https://bunonfabrics.com/wp-content/uploads/2025/10/bunon-saree-banner-6.webp": "/assets/images/bunon-saree-banner-6.webp",
  "https://bunonfabrics.com/wp-content/uploads/2025/02/original-logo-with-black-background.png": "/assets/images/original-logo-with-black-background.png",
  "https://bunonfabrics.com/wp-content/uploads/2025/03/Payment-1-1024x98-1-1.png": "/assets/images/Payment-1-1024x98-1-1.png",
  "https://bunonfabrics.com/wp-content/uploads/2025/06/Bestselling-Saree-banner-1-mobie.jpg": "/assets/images/Bestselling-Saree-banner-1-mobie.jpg",
  "https://bunonfabrics.com/wp-content/uploads/2025/06/product-jpeg-1000x1000-1.jpg": "/assets/images/product-jpeg-1000x1000-1.jpg",
  "https://bunonfabrics.com/wp-content/uploads/2025/10/bunon-saree-banner-4.webp": "/assets/images/bunon-saree-banner-4.webp",
  "https://bunonfabrics.com/wp-content/uploads/2025/03/couple-dress.webp": "/assets/images/couple-dress.webp",
  "https://bunonfabrics.com/wp-content/uploads/2025/03/saree.jpg": "/assets/images/saree.jpg"
};

function processDirectory(dirPath) {
  const files = fs.readdirSync(dirPath);

  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      processDirectory(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts') || fullPath.endsWith('.css')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let changed = false;

      for (const [url, localPath] of Object.entries(urlMap)) {
        if (content.includes(url)) {
          // Note: using split.join to replace all occurrences globally without regex escaping issues
          content = content.split(url).join(localPath);
          changed = true;
        }
      }

      if (changed) {
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log(`Updated: ${fullPath}`);
      }
    }
  }
}

processDirectory(path.join(__dirname, 'src'));
processDirectory(path.join(__dirname, 'server'));
