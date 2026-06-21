import mysql from 'mysql2/promise';
import 'dotenv/config';

async function importProducts() {
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || "127.0.0.1",
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || "bunon_shop_db",
      password: process.env.DB_PASSWORD ? process.env.DB_PASSWORD.replace(/"/g, '') : "",
      database: process.env.DB_NAME || "bunon_shop_db"
    });

    console.log("Connected to database successfully. Fetching from super_api.php...");

    const response = await fetch("https://bunonfabrics.com/super_api.php");
    const json = await response.json();

    if (json.ok && json.data) {
      console.log(`Fetched ${json.data.length} products. Inserting into wc_products_full...`);
      
      let insertedCount = 0;
      for (const p of json.data) {
        const imagesJson = JSON.stringify(p.images || []);
        const categoriesJson = JSON.stringify(p.categories || []);
        const tagsJson = JSON.stringify(p.tags || []);
        const on_sale = p.on_sale ? 1 : 0;
        const thumbnail = p.thumbnail || (p.images && p.images.length > 0 ? p.images[0].src : '');

        // Safe numbers for DECIMAL columns (convert "" to NULL)
        const price = (p.price === "" || p.price == null) ? null : Number(p.price);
        const regular_price = (p.regular_price === "" || p.regular_price == null) ? null : Number(p.regular_price);
        const sale_price = (p.sale_price === "" || p.sale_price == null) ? null : Number(p.sale_price);

        // Check if exists
        const [existing] = await connection.execute("SELECT id FROM wc_products_full WHERE id = ?", [p.id]);
        if (existing.length > 0) {
          await connection.execute(
            `UPDATE wc_products_full SET 
             name=?, slug=?, sku=?, price=?, regular_price=?, sale_price=?, on_sale=?, 
             stock_status=?, stock_quantity=?, description=?, short_description=?, 
             images=?, thumbnail=?, categories=?, tags=?, menu_order=?, total_sales=? 
             WHERE id=?`,
            [p.name, p.slug, p.sku, price, regular_price, sale_price, on_sale, 
             p.stock_status, p.stock_quantity, p.description, p.short_description, 
             imagesJson, thumbnail, categoriesJson, tagsJson, p.menu_order, p.total_sales,
             p.id]
          );
        } else {
          await connection.execute(
            `INSERT INTO wc_products_full 
             (id, wc_product_id, name, slug, sku, price, regular_price, sale_price, on_sale, 
             stock_status, stock_quantity, description, short_description, images, thumbnail, 
             categories, tags, menu_order, date_created, total_sales) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [p.id, p.id, p.name, p.slug, p.sku, price, regular_price, sale_price, on_sale, 
             p.stock_status, p.stock_quantity, p.description, p.short_description, imagesJson, thumbnail, 
             categoriesJson, tagsJson, p.menu_order, p.date_created, p.total_sales]
          );
        }
        insertedCount++;
      }
      console.log(`Successfully imported ${insertedCount} products into wc_products_full!`);
    } else {
      console.error("Invalid response from super_api.php");
    }
    
    await connection.end();
  } catch (error) {
    console.error("Failed to import products:", error);
  }
}

importProducts();
