const mysql = require('mysql2/promise');
require('dotenv').config();

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
    
    await connection.end();
    console.log("Database setup completed.");
  } catch (error) {
    console.error("Failed to setup database:", error);
  }
}

setupDB();
