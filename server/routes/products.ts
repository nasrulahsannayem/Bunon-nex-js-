import express from "express";
import { getCachedProducts } from "../services/redisClient";
import { productDbPool } from "../db";

const router = express.Router();

const DOMAIN_URL = (process.env.DOMAIN_URL || 'https://bunon.shop').replace(/\/$/, '');

router.get("/products/version", async (_req, res) => {
  try {
    const [rows]: any = await productDbPool.execute("SELECT UNIX_TIMESTAMP(MAX(updated_at)) v, COUNT(*) c FROM bunon_products");
    res.set('Cache-Control', 'no-store');
    return res.json({ ok: true, v: Number(rows?.[0]?.v || 0), c: Number(rows?.[0]?.c || 0) });
  } catch { return res.json({ ok: true, v: 0, c: 0 }); }
});

router.get("/products", async (req, res) => {
  const searchTerm = req.query.q ? String(req.query.q).toLowerCase() : "";
  const products = await getCachedProducts();
  
  if (products.length > 0) {
    let filtered = products;
    if (searchTerm) { filtered = filtered.filter((p: any) => p.name.toLowerCase().includes(searchTerm)); }
    
    let defaultFee = 80;
    try {
      const [srows]: any = await productDbPool.execute("SELECT setting_value FROM bunon_settings WHERE setting_key = 'cod_charge_inside' LIMIT 1");
      if (srows && srows.length && srows[0].setting_value != null) {
        const v = Number(srows[0].setting_value);
        if (!isNaN(v)) defaultFee = v;
      }
    } catch { /* shop default fee best-effort */ }

    const productsWithLinks = filtered.map((p: any) => {
      const id = p.id || p.sku;
      // Dual-price: effective = valid sale ?? regular ?? price (bunon_products first, WC fallback rows pass through)
      const regN = (p.regular_price != null && p.regular_price !== '') ? Number(p.regular_price) : NaN;
      const saleN = (p.sale_price != null && p.sale_price !== '') ? Number(p.sale_price) : NaN;
      const baseN = (p.price != null && p.price !== '') ? Number(p.price) : NaN;
      const reg = !isNaN(regN) && regN > 0 ? regN : ((!isNaN(baseN) && baseN > 0) ? baseN : 0);
      const hasSale = !isNaN(saleN) && saleN > 0 && saleN < reg;
      const effPrice = hasSale ? saleN : reg;
      const discAmt = hasSale ? (reg - effPrice) : 0;
      const discPct = hasSale && reg > 0 ? Math.round((discAmt / reg) * 100) : 0;
      const noTrack = Number(p.track_stock) === 0;
      const rawFee = (p.delivery_fee != null && p.delivery_fee !== '') ? Number(p.delivery_fee) : NaN;
      const effFee = isNaN(rawFee) ? defaultFee : rawFee;
      const avail = noTrack ? true : (Number(p.stock_quantity || 0) > 0 || p.stock_status === 'instock');
      return {
        ...p,
        price: String(effPrice),
        regular_price: String(reg),
        sale_price: hasSale ? String(effPrice) : null,
        on_sale: hasSale,
        discount_amount: discAmt,
        discount_percent: discPct,
        product_link: `${DOMAIN_URL}/product/${id}`,
        available: avail,
        availability: avail ? 'in stock' : 'out of stock',
        delivery_fee: (p.delivery_fee != null && p.delivery_fee !== '') ? Number(p.delivery_fee) : null,
        effective_delivery_fee: effFee
      };
    });

    return res.json({ ok: true, source: 'RAM-Database', data: productsWithLinks });
  } else { return res.status(503).json({ ok: false, message: 'Syncing...' }); }
});

router.post("/verify-coupon", async (req, res) => {
  try {
    const { code, cartTotal } = req.body || {};
    if (!code || !String(code).trim()) return res.status(400).json({ valid: false, message: "কুপন কোড দিন!" });
    const sub = Number(cartTotal || 0);
    const normalized = String(code).trim().toUpperCase();

    try {
      const [rows]: any = await productDbPool.execute('SELECT code, type, value, min_order, usage_limit, used_count, starts_at, ends_at, status FROM bunon_coupons WHERE code = ? LIMIT 1', [normalized]);
      if (rows && rows.length > 0) {
        const c = rows[0];
        if (c.status !== 'active') return res.json({ valid: false, message: 'কুপনটি সক্রিয় নয়!' });
        const now = new Date();
        if (c.starts_at && new Date(c.starts_at) > now) return res.json({ valid: false, message: 'কুপন এখনো কার্যকর নয়!' });
        if (c.ends_at && new Date(c.ends_at) < now) return res.json({ valid: false, message: 'মেয়াদ শেষ!' });
        if (c.usage_limit != null && Number(c.used_count) >= Number(c.usage_limit)) return res.json({ valid: false, message: 'কুপনের সীমা শেষ!' });
        const minAmount = Number(c.min_order || 0);
        if (sub < minAmount) return res.json({ valid: false, message: "ন্যূনতম ৳" + minAmount });
        let discount = 0;
        if (c.type === 'percent') discount = Math.round((sub * Number(c.value)) / 100 * 100) / 100;
        else discount = Math.min(Number(c.value), sub);
        return res.json({ valid: true, code: c.code, discount: Number(discount.toFixed(2)), discount_type: c.type, source: 'local' });
      }
    } catch (dbErr: any) {
      console.error("[COUPON API] Local lookup failed:", dbErr && dbErr.message ? dbErr.message : dbErr);
    }

    const CK = process.env.WC_KEY || "";
    const CS = process.env.WC_SECRET || "";
    if (!CK || !CS) return res.json({ valid: false, message: 'কুপনটি সঠিক নয়!' });
    try {
      const STORE_URL = 'https://bunonfabrics.com';
      const auth = Buffer.from(CK + ":" + CS).toString("base64");
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      let response: any;
      try {
        response = await fetch(STORE_URL + "/wp-json/wc/v3/coupons?code=" + encodeURIComponent(String(code).toLowerCase()), { headers: { Authorization: "Basic " + auth }, signal: ctrl.signal as any });
      } finally { clearTimeout(timer); }
      const ct = (response.headers && response.headers.get ? response.headers.get('content-type') : '') || '';
      if (!response.ok || ct.indexOf('application/json') < 0) return res.json({ valid: false, message: 'কুপনটি সঠিক নয়!' });
      const coupons: any = await response.json();
      if (!Array.isArray(coupons) || coupons.length === 0) return res.json({ valid: false, message: 'কুপনটি সঠিক নয়!' });
      const coupon = coupons[0];
      if (coupon.date_expires && new Date(coupon.date_expires) < new Date()) return res.json({ valid: false, message: 'মেয়াদ শেষ!' });
      const minAmount = parseFloat(coupon.minimum_amount || "0");
      if (sub < minAmount) return res.json({ valid: false, message: "ন্যূনতম ৳" + minAmount });
      let discount = coupon.discount_type === "percent" ? (sub * parseFloat(coupon.amount)) / 100 : parseFloat(coupon.amount);
      return res.json({ valid: true, code: coupon.code, discount: Number(Number(discount).toFixed(2)), discount_type: coupon.discount_type, source: "wc" });
    } catch (wcErr: any) {
      console.error("[COUPON API] WC fallback failed:", wcErr && wcErr.message ? wcErr.message : wcErr);
      return res.json({ valid: false, message: 'সার্ভারে সমস্যা, আবার চেষ্টা করুন' });
    }
  } catch (error: any) {
    console.error("Coupon Verification Error Log:", error && error.message ? error.message : error);
    return res.json({ valid: false, message: 'সার্ভারে সমস্যা, আবার চেষ্টা করুন' });
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

router.get("/feed", async (req, res) => {
  try {
    const products = await getCachedProducts();
    if (!products || products.length === 0) {
      return res.status(503).send("Feed is syncing. Please try again in a few seconds.");
    }

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
    xml += `    <link>${DOMAIN_URL}</link>\n`;
    xml += `    <description>Premium Heritage Textiles &amp; Sarees from Bunon Fabrics</description>\n`;

    products.forEach((p: any) => {
      const id = p.id || p.sku;
      const link = `${DOMAIN_URL}/product/${id}`;
      const imageLink = p.images && p.images.length > 0 ? escapeXML(p.images[0].src.split('?')[0]) : '';
      const title = escapeXML(p.name);
      const description = escapeXML(stripHTML(p.description || p.name)).substring(0, 4999);
      const availability = (Number(p.track_stock) === 0 || p.available || p.stock_status === 'instock') ? 'in stock' : 'out of stock';
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
