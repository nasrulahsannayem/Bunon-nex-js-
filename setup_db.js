import mysql from 'mysql2/promise';
import 'dotenv/config';

async function setupDB() {
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || "127.0.0.1",
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || "bunon_shop_db",
      password: process.env.DB_PASSWORD ? process.env.DB_PASSWORD.replace(/"/g, '') : "",
      database: process.env.DB_NAME || "bunon_shop_db"
    });

    console.log("Connected to database successfully.");

    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS wc_products_full (
        id INT PRIMARY KEY,
        wc_product_id INT,
        name VARCHAR(255),
        slug VARCHAR(255),
        sku VARCHAR(100),
        price DECIMAL(10, 2),
        regular_price DECIMAL(10, 2),
        sale_price DECIMAL(10, 2),
        on_sale BOOLEAN,
        stock_status VARCHAR(50),
        stock_quantity INT NULL,
        description LONGTEXT,
        short_description TEXT,
        images JSON,
        thumbnail VARCHAR(255),
        categories JSON,
        tags JSON,
        menu_order INT,
        date_created DATETIME,
        total_sales INT DEFAULT 0
      );
    `;

    await connection.execute(createTableQuery);
    console.log("Table 'wc_products_full' created or already exists.");

    const createEmailLogsTable = `
      CREATE TABLE IF NOT EXISTS bf_email_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id VARCHAR(50),
        recipient_email VARCHAR(191),
        email_type VARCHAR(50),
        status ENUM('pending', 'sent', 'failed') DEFAULT 'pending',
        error_message TEXT,
        attempts INT DEFAULT 0,
        last_attempt DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `;
    await connection.execute(createEmailLogsTable);
    console.log("Table 'bf_email_logs' created or already exists.");
    try {
      await connection.execute(`ALTER TABLE bf_order_items MODIFY order_id INT(10) UNSIGNED`);
      await connection.execute(`ALTER TABLE bf_order_items MODIFY woo_order_id BIGINT(20) UNSIGNED`);
      console.log("Ensured bf_order_items has correct column sizes.");
    } catch (e) {
      console.log("Could not alter bf_order_items (maybe it does not exist yet).");
    }
    
    await connection.end();
    console.log("Database setup completed.");
  } catch (error) {
    console.error("Failed to setup database:", error);
  }
}

setupDB();
