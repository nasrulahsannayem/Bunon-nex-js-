const mysql = require('mysql2/promise');
require('dotenv').config();

async function migrate() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'bunon_shop'
  });

  try {
    console.log('Altering bunon_users table...');
    await connection.execute(`ALTER TABLE bunon_users MODIFY COLUMN role ENUM('customer', 'staff', 'admin', 'super_admin') DEFAULT 'customer'`);
    
    // Check if permissions column exists
    const [cols] = await connection.execute(`SHOW COLUMNS FROM bunon_users LIKE 'permissions'`);
    if (cols.length === 0) {
      await connection.execute(`ALTER TABLE bunon_users ADD COLUMN permissions JSON NULL`);
      console.log('Added permissions JSON column.');
    } else {
      console.log('permissions column already exists.');
    }
    
    // Also, orders table needs steadfast columns
    const [orderCols1] = await connection.execute(`SHOW COLUMNS FROM bf_orders LIKE 'consignment_id'`);
    if (orderCols1.length === 0) {
      await connection.execute(`ALTER TABLE bf_orders ADD COLUMN consignment_id VARCHAR(255) NULL`);
      console.log('Added consignment_id to bf_orders');
    }
    
    const [orderCols2] = await connection.execute(`SHOW COLUMNS FROM bf_orders LIKE 'tracking_code'`);
    if (orderCols2.length === 0) {
      await connection.execute(`ALTER TABLE bf_orders ADD COLUMN tracking_code VARCHAR(255) NULL`);
      console.log('Added tracking_code to bf_orders');
    }

    console.log('Migration completed successfully.');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await connection.end();
  }
}

migrate();
