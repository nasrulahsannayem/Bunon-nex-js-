const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function createSuperAdmin() {
  const args = process.argv.slice(2);
  if (args.length < 3) {
    console.log('Usage: node create-super-admin.cjs <phone> <password> <name>');
    console.log('Example: node create-super-admin.cjs "01700000000" "admin123" "Super Admin"');
    process.exit(1);
  }

  const phone = args[0];
  const password = args[1];
  const name = args[2];

  try {
    const pool = mysql.createPool({
      host: process.env.DB_HOST || '127.0.0.1',
      user: process.env.DB_USER || 'bunon_shop',
      password: process.env.DB_PASSWORD || 'O0j2H0g1T3H0u0h7',
      database: process.env.DB_NAME || 'bunon_shop_db',
      waitForConnections: true,
      connectionLimit: 5,
    });

    const hashedPassword = await bcrypt.hash(password, 10);
    const permissions = JSON.stringify(['view_orders', 'edit_orders', 'view_products', 'edit_products', 'manage_users', 'manage_settings']);

    const [result] = await pool.execute(
      `INSERT INTO bunon_users (name, phone, password, role, permissions) 
       VALUES (?, ?, ?, 'super_admin', ?)
       ON DUPLICATE KEY UPDATE 
       password = ?, role = 'super_admin', permissions = ?`,
      [name, phone, hashedPassword, permissions, hashedPassword, permissions]
    );

    console.log(`✅ Super Admin created successfully!`);
    console.log(`Phone: ${phone}`);
    console.log(`Password: ${password}`);
    
    process.exit(0);
  } catch (error) {
    console.error('Error creating super admin:', error.message);
    process.exit(1);
  }
}

createSuperAdmin();
