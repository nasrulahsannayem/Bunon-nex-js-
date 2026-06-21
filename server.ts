import express from "express";
import path from "path";
import dotenv from "dotenv";
import mysql from "mysql2/promise"; 
import fs from "fs"; 
import cors from "cors"; 
import axios from "axios";

dotenv.config();

const graphqlCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 15 * 1000; 

// 🚀 HIGH PERFORMANCE LOCAL UNIX SOCKET POOL
const dbPool = mysql.createPool({
  host: process.env.DASH_DB_HOST || "127.0.0.1",
  port: Number(process.env.DASH_DB_PORT) || 3306,
  user: process.env.DASH_DB_USER || "bunonfabrics_dash_db",
  password: process.env.DASH_DB_PASSWORD?.replace(/\"/g, '') || "",
  database: process.env.DASH_DB_NAME || "bunonfabrics_dash_db",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// 🚀 PRODUCT DATABASE POOL (Direct connection to bunon_shop_db)
const productDbPool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || "bunon_shop_db",
  password: process.env.DB_PASSWORD ? process.env.DB_PASSWORD.replace(/"/g, '') : "",
  database: process.env.DB_NAME || "bunon_shop_db",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

let ramDatabase: { products: any[]; lastUpdated: number } = {
  products: [],
  lastUpdated: 0
};

// 🟢 গ্লোবাল স্কোপে EcomOS ম্যাপ ডিক্লেয়ার করা হলো
let ecomosProductMap = new Map<string, number>();

const API_URL = "https://bunonfabrics.com/super_api.php";

const syncLocalDatabase = async () => {
  try {
    const [rows]: any = await productDbPool.execute(`
        SELECT 
            id, wc_product_id, name, slug, sku, price, regular_price, sale_price, 
            on_sale, stock_status, stock_quantity, description, short_description, 
            images, thumbnail, categories, tags, menu_order, date_created, total_sales
        FROM wc_products_full
    `);
    
    if (rows && rows.length > 0) {
      ramDatabase.products = rows.map((p: any) => {
        let parsedImages = [];
        let parsedCategories = [];
        let parsedTags = [];
        try { parsedImages = typeof p.images === 'string' ? JSON.parse(p.images) : (p.images || []); } catch(e){}
        try { parsedCategories = typeof p.categories === 'string' ? JSON.parse(p.categories) : (p.categories || []); } catch(e){}
        try { parsedTags = typeof p.tags === 'string' ? JSON.parse(p.tags) : (p.tags || []); } catch(e){}

        return {
          id: p.wc_product_id || p.id,
          wc_product_id: p.wc_product_id,
          name: p.name,
          slug: p.slug || p.name.toLowerCase().replace(/\\s+/g, '-'),
          sku: p.sku,
          price: p.price,
          regular_price: p.regular_price,
          sale_price: p.sale_price,
          on_sale: !!p.on_sale,
          stock_status: p.stock_status || 'instock',
          stock_quantity: p.stock_quantity,
          description: p.description || '',
          short_description: p.short_description || '',
          images: parsedImages.length > 0 ? parsedImages : [{ src: p.thumbnail || '' }],
          thumbnail: p.thumbnail || (parsedImages.length > 0 ? parsedImages[0].src : ''),
          categories: parsedCategories.length > 0 ? parsedCategories : [{ name: 'All Products', slug: 'All' }],
          tags: parsedTags,
          menu_order: p.menu_order || 0,
          date_created: p.date_created,
          total_sales: p.total_sales || 0
        };
      });
      ramDatabase.lastUpdated = Date.now();
      console.log(`[RAM-DB] Successfully loaded ${ramDatabase.products.length} FULL products from DIRECT LOCAL DB! ⚡`);
    }
  } catch (error: any) {
    console.error('[RAM-DB] Local DB Sync Failed:', error.message);
  }
};

syncLocalDatabase();
// Notice: We removed the setInterval API fetch because we will rely on Webhooks for real-time updates.

// 🟢 গ্লোবাল স্কোপে EcomOS Sync ফাংশন
async function syncEcomosProducts() {
  try {
    let page = 1;
    let hasMore = true;
    ecomosProductMap.clear(); 

    while (hasMore) {
      const response = await axios.get(`https://my.ecomos.store/api/v1/products?limit=100&page=${page}`, {
        headers: { "Authorization": `Bearer ${process.env.ECOMOS_API_TOKEN}` }
      });

      const { data, last_page } = response.data.data;
      
      data.forEach((p: any) => {
        if (p.sku) {
            ecomosProductMap.set(p.sku, p.id);
        }
      });

      console.log(`[EcomOS] Syncing page ${page}...`);
      
      if (page >= last_page) {
        hasMore = false;
      } else {
        page++;
      }
    }
    console.log("[EcomOS] Product Map Updated Successfully with all products!");
  } catch (e: any) {
    console.error("[EcomOS] Failed to sync products:", e.message);
  }
}

// 🟢 সার্ভার স্টার্ট হওয়ার সময় একবার চালান
syncEcomosProducts();
setInterval(syncEcomosProducts, 60 * 60 * 1000); 


// 🚀 EcomOS Sync Helper Function
async function sendToEcomOS(orderData: any) {
  const token = process.env.ECOMOS_API_TOKEN;
  console.log("[DEBUG] Starting EcomOS Sync. Token exists:", !!token);

  if (!token) {
    console.error("[ERROR] ECOMOS_API_TOKEN is not defined in .env!");
    return;
  }

  try {
    console.log("[DEBUG] Sending payload to EcomOS:", JSON.stringify(orderData));
    
    const response = await axios.post("https://my.ecomos.store/api/v1/orders", orderData, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/json",
        "Content-Type": "application/json"
      }
    });
    
    console.log("[EcomOS] Order synced successfully! Invoice:", response.data?.data?.invoice);
  } catch (error: any) {
    if (error.response) {
      console.error("[EcomOS] API Error Response:", JSON.stringify(error.response.data));
    } else {
      console.error("[EcomOS] Network Error:", error.message);
    }
  }
}


// ==========================================================
// 🚀 MAIN SERVER START
// ==========================================================
async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 5000; 

  app.use(cors({ origin: '*' }));
  app.use(express.json());

  app.post("/api/webhook/woocommerce/product", async (req, res) => {
    try {
      const payload = req.body;
      const event = req.headers['x-wc-webhook-event'] || 'updated'; 
      
      console.log(`[WEBHOOK] Received product event: ${event}`);

      if (event === 'deleted' && payload.id) {
        await productDbPool.execute("DELETE FROM wc_products_full WHERE wc_product_id = ? OR id = ?", [payload.id, payload.id]);
        ramDatabase.products = ramDatabase.products.filter(p => p.id !== payload.id);
      } else if ((event === 'updated' || event === 'created') && payload.id) {
        const product_id = payload.id;
        const name = payload.name || "";
        const slug = payload.slug || "";
        const sku = payload.sku || "N/A";
        const price = payload.price || 0;
        const regular_price = payload.regular_price || price;
        const sale_price = payload.sale_price || price;
        const on_sale = payload.on_sale ? 1 : 0;
        const stock_status = payload.stock_status || "instock";
        const stock_quantity = payload.stock_quantity || null;
        const description = payload.description || "";
        const short_description = payload.short_description || "";
        const imagesJson = JSON.stringify(payload.images || []);
        const categoriesJson = JSON.stringify(payload.categories || []);
        const tagsJson = JSON.stringify(payload.tags || []);
        const thumbnail = payload.images && payload.images.length > 0 ? payload.images[0].src : "";
        const menu_order = payload.menu_order || 0;
        const date_created = payload.date_created || new Date().toISOString().slice(0, 19).replace('T', ' ');
        const total_sales = payload.total_sales || 0;

        const [existing]: any = await productDbPool.execute("SELECT id FROM wc_products_full WHERE wc_product_id = ? OR id = ?", [product_id, product_id]);
        if (existing.length > 0) {
           await productDbPool.execute(
             `UPDATE wc_products_full SET 
              name=?, slug=?, sku=?, price=?, regular_price=?, sale_price=?, on_sale=?, 
              stock_status=?, stock_quantity=?, description=?, short_description=?, 
              images=?, thumbnail=?, categories=?, tags=?, menu_order=?, total_sales=? 
              WHERE wc_product_id=? OR id=?`,
             [name, slug, sku, price, regular_price, sale_price, on_sale, 
              stock_status, stock_quantity, description, short_description, 
              imagesJson, thumbnail, categoriesJson, tagsJson, menu_order, total_sales,
              product_id, product_id]
           );
        } else {
           await productDbPool.execute(
             `INSERT INTO wc_products_full 
              (id, wc_product_id, name, slug, sku, price, regular_price, sale_price, on_sale, 
              stock_status, stock_quantity, description, short_description, images, thumbnail, 
              categories, tags, menu_order, date_created, total_sales) 
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
             [product_id, product_id, name, slug, sku, price, regular_price, sale_price, on_sale, 
              stock_status, stock_quantity, description, short_description, imagesJson, thumbnail, 
              categoriesJson, tagsJson, menu_order, date_created, total_sales]
           );
        }
        
        syncLocalDatabase();
      }

      res.status(200).send("Webhook processed");
    } catch (error: any) {
      console.error("[WEBHOOK Error]", error.message);
      res.status(500).send("Webhook Error");
    }
  });

  app.post("/api/checkout/place-order", async (req, res) => {
    try {
      const { customer, cart, paymentMethod, totalAmount, shippingFee, discount, coupons } = req.body;

      if (!customer || !cart || cart.length === 0) {
        return res.status(400).json({ ok: false, msg: "Cart or Customer details missing!" });
      }

      const generatedOrderId = Math.floor(100000 + Math.random() * 900000);
      const invoiceNumber = "INV-" + new Date().toISOString().slice(2,10).replace(/-/g,'') + "-" + Math.floor(1000 + Math.random() * 9000);
      
      let totalCouponDiscount = 0;
      if (coupons && coupons.length > 0) {
         totalCouponDiscount = coupons.reduce((sum: number, c: any) => sum + Number(c.discount || 0), 0);
      }
      
      const subtotal = totalAmount - shippingFee + discount + totalCouponDiscount;

      let customerType = 'new';
      try {
        const [existingCust]: any = await dbPool.execute(
          "SELECT id FROM bf_orders WHERE phone = ? LIMIT 1",
          [customer.phone]
        );
        if (existingCust.length > 0) customerType = 'returning';
      } catch (err) {
        console.error("Customer tracking skipped.");
      }

      // ❌ EcomOS ডেটা তৈরি এবং ভ্যালিডেশন আপাতত বন্ধ করা হলো
      /*
      const ecomosItems = cart.map((item: any) => {
          const ecomosId = ecomosProductMap.get(item.sku);
          
          if (!ecomosId) {
              throw new Error(`SKU '${item.sku}' EcomOS-এ খুঁজে পাওয়া যায়নি! দয়া করে প্রোডাক্টের SKU চেক করুন।`);
          }

          return {
              product_id: ecomosId,
              price: item.price,
              quantity: item.quantity
          };
      });

      const ecomosOrderData = {
          customer_name: customer.name,
          phone: customer.phone,
          address: customer.address,
          district: customer.city || "Dhaka",
          delivery_charge: shippingFee,
          discount: discount + totalCouponDiscount,
          items: ecomosItems
      };
      */

      console.log(`[SOCKET-DB] Inserting Order #${generatedOrderId} via Unix Socket...`);
      const [orderResult]: any = await dbPool.execute(
        `INSERT INTO bf_orders (
          woo_order_id, invoice, customer_name, phone, address, 
          subtotal, delivery_fee, discount_amount, total_payable, 
          payment_method, status, city, state, fbp, fbc, external_id, customer_type, source, is_paid, cod_amount
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, 'react_site', 0, ?)`,
        [
          generatedOrderId, invoiceNumber, customer.name, customer.phone, customer.address,
          subtotal, shippingFee, (discount + totalCouponDiscount), totalAmount, paymentMethod,
          customer.city, customer.area || "", customer.fbp || null, customer.fbc || null,
          String(generatedOrderId), customerType, totalAmount
        ]
      );

      const bfOrderId = orderResult.insertId;

      for (const item of cart) {
        await dbPool.execute(
          `INSERT INTO bf_order_items (
            order_id, woo_order_id, product_id, product_name, product_thumb, sku, qty, price, line_total, thumb, source
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'react_site')`,
          [
            bfOrderId, generatedOrderId, item.id, item.name, item.thumbnail || "",
            item.sku || "N/A", item.quantity, item.price, (item.price * item.quantity), item.thumbnail || ""
          ]
        );
      }

      // ❌ ব্যাকগ্রাউন্ডে অর্ডারটি EcomOS-এ পাঠানো আপাতত বন্ধ করা হলো
      // sendToEcomOS(ecomosOrderData); 

      
      // 💳 মেথড ১: বিকাশ গেটওয়ে ইনিশিয়ালাইজেশন
      if (paymentMethod === "bkash") {
        console.log(`[PAYMENT] Triggering Tokenized bKash Checkout for Order #${generatedOrderId}...`);
        
        const username   = process.env.BKASH_USERNAME ? process.env.BKASH_USERNAME.replace(/"/g, '') : "";
        const password   = process.env.BKASH_PASSWORD ? process.env.BKASH_PASSWORD.replace(/"/g, '') : "";
        const app_key    = process.env.BKASH_APP_KEY ? process.env.BKASH_APP_KEY.replace(/"/g, '') : "";
        const app_secret = process.env.BKASH_APP_SECRET ? process.env.BKASH_APP_SECRET.replace(/"/g, '') : "";

        const BKASH_BASE_URL = "https://tokenized.pay.bka.sh/v1.2.0-beta";

        const tokenRes = await fetch(`${BKASH_BASE_URL}/tokenized/checkout/token/grant`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "username": username,
            "password": password
          },
          body: JSON.stringify({ app_key, app_secret })
        });
        
        const tokenData: any = await tokenRes.json();
        
        if (!tokenData || !tokenData.id_token) {
          return res.status(500).json({ 
            ok: false, 
            msg: `bKash Auth Failed: ${tokenData.statusMessage || tokenData.message || 'Missing Authentication Token'}` 
          });
        }

        const idToken = tokenData.id_token;

        const createRes = await fetch(`${BKASH_BASE_URL}/tokenized/checkout/create`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": idToken,
            "X-APP-Key": app_key
          },
          body: JSON.stringify({
            mode: "0011",
            payerReference: customer.phone,
            callbackURL: `https://bunon.shop/api/payment/bkash-callback?order_id=${bfOrderId}&wid=${generatedOrderId}&token=${idToken}`,
            amount: totalAmount.toString(),
            currency: "BDT",
            intent: "sale",
            merchantInvoiceNumber: invoiceNumber
          })
        });
        
        const createData: any = await createRes.json();
        
        if (createData.bkashURL) {
          return res.json({ ok: true, gateway: true, redirectUrl: createData.bkashURL });
        } else {
          return res.status(500).json({ 
            ok: false, 
            msg: `bKash Create Failed: ${createData.statusMessage || createData.errorMessage}` 
          });
        }
      }

      // 💳 মেথড ২: পেস্টেশন গেটওয়ে ইনিশিয়ালাইজেশন
      if (paymentMethod === "paystation") {
        console.log(`[PAYMENT] Triggering PayStation Checkout for Order #${generatedOrderId}...`);
        
        const paystationBody = new URLSearchParams();
        paystationBody.append("merchantId", process.env.PAYSTATION_MERCHANT_ID || "");
        paystationBody.append("password", process.env.PAYSTATION_PASSWORD || "");
        paystationBody.append("invoice_number", invoiceNumber);
        paystationBody.append("currency", "BDT");
        paystationBody.append("payment_amount", totalAmount.toString());
        paystationBody.append("cust_name", customer.name);
        paystationBody.append("cust_phone", customer.phone);
        paystationBody.append("cust_email", customer.email || `${customer.phone}@bunon.shop`);
        paystationBody.append("cust_address", customer.address || "Dhaka, Bangladesh");
        paystationBody.append("callback_url", `https://bunon.shop/api/payment/paystation-callback?order_id=${bfOrderId}`);
        paystationBody.append("checkout_items", "React Custom Premium Saree Purchase Feed");

        const psRes = await fetch("https://api.paystation.com.bd/initiate-payment", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: paystationBody
        });
        const psData = await psRes.json();

        if (psData.status === "success" && psData.payment_url) {
          return res.json({ ok: true, gateway: true, redirectUrl: psData.payment_url });
        } else {
          console.error("[PayStation API Error Response]:", psData);
          return res.status(500).json({ ok: false, msg: psData.message || "PayStation Gateway Initialization Failed" });
        }
      }

      // 📦 মেথড ৩: ক্যাশ অন ডেলিভারি (COD)
      return res.json({ ok: true, gateway: false, order_id: bfOrderId, invoice: invoiceNumber, msg: "COD Order Placed Successfully!" });

    } catch (error: any) {
      console.error("[Unix-Socket Checkout Engine Error]:", error.message);
      res.status(500).json({ ok: false, msg: `Checkout Error: ${error.message}` });
    }
  });


  app.post("/api/verify-coupon", async (req, res) => {
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
      
      if (!coupons || coupons.length === 0) return res.json({ valid: false, message: "কুপনটি সঠিক নয়!" });

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

  app.get("/api/payment/bkash-callback", async (req, res) => {
    const { paymentID, status, order_id, token } = req.query;
    const numericOrderId = Number(order_id);

    if (status === "success" && numericOrderId) {
      try {
        const app_key = process.env.BKASH_APP_KEY ? process.env.BKASH_APP_KEY.replace(/"/g, '') : "";
        const execRes = await fetch("https://tokenized.pay.bka.sh/v1.2.0-beta/tokenized/checkout/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": String(token), "X-APP-Key": app_key },
          body: JSON.stringify({ paymentID })
        });
        const execData = await execRes.json();
        if (execData.transactionStatus === "Completed") {
          await dbPool.execute(
            `UPDATE bf_orders 
             SET is_paid = 1, cod_amount = 0, due_amount = 0, total_payable = 0, discount_amount = (subtotal + delivery_fee) 
             WHERE id = ?`, 
            [numericOrderId]
          );
          return res.redirect(`/order-received?order_id=${numericOrderId}&method=bkash&total=${execData.amount}`);
        }
      } catch (e) {
        console.error("[bKash Verification Error]:", e);
      }
    }
    
    console.log(`[PAYMENT CANCELLED] bKash Order #${numericOrderId} remains as full pending COD.`);
    return res.redirect(`/checkout?payment_error=failed`);
  });

  app.get("/api/payment/paystation-callback", async (req, res) => {
    const { status, order_id } = req.query;
    const numericOrderId = Number(order_id);

    if (status === "Successful" && numericOrderId) {
      await dbPool.execute(
        `UPDATE bf_orders 
         SET is_paid = 1, cod_amount = 0, due_amount = 0, total_payable = 0, discount_amount = (subtotal + delivery_fee) 
         WHERE id = ?`, 
        [numericOrderId]
      );
      return res.redirect(`/order-received?order_id=${numericOrderId}&method=paystation`);
    }

    console.log(`[PAYMENT CANCELLED] PayStation Order #${numericOrderId} remains as full pending COD.`);
    return res.redirect(`/checkout?payment_error=failed`);
  });

  app.post("/api/graphql", async (req, res) => {
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
  
  app.get("/api/products", (req, res) => {
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

  app.post("/api/track/*", (req, res) => res.json({ status: "ok" }));

  app.get("/api/feed", (req, res) => {
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

  const distPath = path.join(process.cwd(), "dist");
  app.use(express.static(distPath, { index: false }));
  
  app.get("*", (req, res) => {
    const indexPath = path.join(distPath, "index.html");
    
    fs.readFile(indexPath, "utf8", (err, html) => {
      if (err) {
        console.error("Error reading index.html:", err);
        return res.status(500).send("Error loading index.html");
      }

      const gtagCode = `
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-FB87L7SJ3F"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());

      gtag('config', 'G-FB87L7SJ3F');
    </script>
      `;

      const modifiedHtml = html.replace('</head>', `${gtagCode}\n</head>`);
      res.send(modifiedHtml);
    });
  }); 

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running successfully on port ${PORT} via High-Performance Unix Socket Grid!`);
  });
}

startServer();