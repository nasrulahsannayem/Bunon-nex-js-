import express from "express";
import { ramDatabase } from "../store";

const router = express.Router();

router.get("/products", (req, res) => {
  const searchTerm = req.query.q ? String(req.query.q).toLowerCase() : "";
  if (ramDatabase.products.length > 0) {
    let filtered = ramDatabase.products;
    if (searchTerm) { filtered = filtered.filter((p: any) => p.name.toLowerCase().includes(searchTerm)); }
    
    const productsWithLinks = filtered.map((p: any) => {
      const id = p.id || p.sku;
      return {
        ...p,
        product_link: `https://bunon.shop/product/${id}`
      };
    });

    return res.json({ ok: true, source: 'RAM-Database', data: productsWithLinks });
  } else { return res.status(503).json({ ok: false, message: 'Syncing...' }); }
});

router.post("/verify-coupon", async (req, res) => {
  try {
    const { code, cartTotal } = req.body;
    const CK = process.env.WC_KEY || ""; 
    const CS = process.env.WC_SECRET || "";
    const STORE_URL = 'https://bunonfabrics.com';

    if (!code) return res.status(400).json({ valid: false, message: "কুপন কোড দিন!" });

    const auth = Buffer.from(`${CK}:${CS}`).toString("base64");
    
    const response = await fetch(`${STORE_URL}/wp-json/wc/v3/coupons?code=${code.toLowerCase()}`, {
      headers: { "Authorization": `Basic ${auth}` }
    });

    const coupons = await response.json();
    
    if (!Array.isArray(coupons) || coupons.length === 0) {
      console.error("[COUPON API] Expected array, got:", coupons);
      return res.json({ valid: false, message: "কুপনটি সঠিক নয়!" });
    }

    const coupon = coupons[0];
    
    if (coupon.date_expires && new Date(coupon.date_expires) < new Date()) {
       return res.json({ valid: false, message: "মেয়াদ শেষ!" });
    }

    const minAmount = parseFloat(coupon.minimum_amount || "500");
    if (cartTotal < minAmount) {
       return res.json({ valid: false, message: `ন্যূনতম ৳${minAmount} অর্ডার করতে হবে` });
    }

    let discount = coupon.discount_type === "percent" ? (cartTotal * parseFloat(coupon.amount)) / 100 : parseFloat(coupon.amount);

    return res.json({ valid: true, code: coupon.code, discount: Number(discount.toFixed(2)), discount_type: coupon.discount_type });
  } catch (error: any) {
    console.error("Coupon Verification Error Log:", error);
    return res.status(500).json({ valid: false, message: error.message });
  }
});

router.post("/graphql", async (req, res) => {
  try {
    const response = await fetch("https://bunonfabrics.com/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    res.json(data);
  } catch (e) { res.status(500).json({ error: "GraphQL fetch error" }); }
});

router.get("/feed", (req, res) => {
  try {
    if (!ramDatabase.products || ramDatabase.products.length === 0) {
      return res.status(503).send("Feed is syncing. Please try again in a few seconds.");
    }

    const products = ramDatabase.products;

    const escapeXML = (str: string) => {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
    };

    const stripHTML = (html: string) => {
      if (!html) return '';
      return String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    };

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">\n`;
    xml += `  <channel>\n`;
    xml += `    <title>Bunon Fabrics Catalog</title>\n`;
    xml += `    <link>https://bunon.shop</link>\n`;
    xml += `    <description>Premium Heritage Textiles &amp; Sarees from Bunon Fabrics</description>\n`;

    products.forEach((p: any) => {
      const id = p.id || p.sku;
      const link = `https://bunon.shop/product/${id}`;
      const imageLink = p.images && p.images.length > 0 ? escapeXML(p.images[0].src.split('?')[0]) : '';
      const title = escapeXML(p.name);
      const description = escapeXML(stripHTML(p.description || p.name)).substring(0, 4999);
      const availability = p.stock_status === 'instock' ? 'in stock' : 'out of stock';
      const price = p.regular_price ? `${p.regular_price} BDT` : `${p.price || 0} BDT`;
      
      const category = p.categories && p.categories.length > 0 ? escapeXML(p.categories[0].name) : 'Fashion';

      xml += `    <item>\n`;
      xml += `      <g:id>${id}</g:id>\n`;
      xml += `      <g:title>${title}</g:title>\n`;
      xml += `      <g:description>${description}</g:description>\n`;
      xml += `      <g:link>${link}</g:link>\n`;
      xml += `      <g:image_link>${imageLink}</g:image_link>\n`;
      xml += `      <g:brand>Bunon Fabrics</g:brand>\n`; 
      xml += `      <g:product_type>${category}</g:product_type>\n`; 
      xml += `      <g:condition>new</g:condition>\n`;
      xml += `      <g:availability>${availability}</g:availability>\n`;
      xml += `      <g:price>${price}</g:price>\n`;

      if (p.sale_price && p.sale_price < p.regular_price) {
        xml += `      <g:sale_price>${p.sale_price} BDT</g:sale_price>\n`;
      }
      xml += `    </item>\n`;
    });

    xml += `  </channel>\n</rss>`;

    res.setHeader('Content-Type', 'text/xml; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate'); 
    res.status(200).send(xml);
  } catch (error: any) {
    console.error("Feed API Error:", error.message);
    res.status(500).json({ error: "Feed generation failed" });
  }
});

export default router;
