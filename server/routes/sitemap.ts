import { Router } from "express";
import { getCachedProducts } from "../services/redisClient";

const router = Router();

router.get("/sitemap.xml", async (req, res) => {
  try {
    const products = await getCachedProducts();
    const baseUrl = "https://bunon.shop";

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${baseUrl}/shop</loc>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>${baseUrl}/about</loc>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
  <url>
    <loc>${baseUrl}/contact</loc>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
`;

    for (const product of products) {
      xml += `  <url>
    <loc>${baseUrl}/product/${product.id}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>\n`;
    }

    xml += `</urlset>`;

    res.header("Content-Type", "application/xml");
    res.send(xml);
  } catch (error) {
    console.error("Error generating sitemap:", error);
    res.status(500).end();
  }
});

export default router;
