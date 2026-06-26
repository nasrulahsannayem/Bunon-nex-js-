import express from "express";
import { productDbPool } from "../db";
import { ramDatabase, syncLocalDatabase } from "../store";

const router = express.Router();

router.post("/woocommerce/product", async (req, res) => {
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

export default router;
