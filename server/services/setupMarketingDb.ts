import { productDbPool } from "../db";

export async function setupMarketingTables() {
  try {
    // 1. wc_marketing_emails table
    await productDbPool.execute(`
      CREATE TABLE IF NOT EXISTS wc_marketing_emails (
          id INT AUTO_INCREMENT PRIMARY KEY,
          email VARCHAR(255) NOT NULL UNIQUE,
          phone VARCHAR(20) NULL,
          name VARCHAR(255) NULL,
          status ENUM('subscribed', 'unsubscribed') DEFAULT 'subscribed',
          last_email_sent_at DATETIME NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 2. wc_cart_recovery_queue table
    await productDbPool.execute(`
      CREATE TABLE IF NOT EXISTS wc_cart_recovery_queue (
          id INT AUTO_INCREMENT PRIMARY KEY,
          email VARCHAR(255) NOT NULL,
          phone VARCHAR(20) NOT NULL,
          customer_name VARCHAR(255) NULL,
          cart_data LONGTEXT NOT NULL,
          discount_offered INT DEFAULT 0,
          status ENUM('pending', 'sent', 'converted', 'cancelled') DEFAULT 'pending',
          attempts INT DEFAULT 0,
          last_attempt_at DATETIME NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY idx_email_phone (email, phone)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    console.log("[DB] Marketing and recovery tables initialized successfully!");
  } catch (error: any) {
    console.error("[DB] Failed to initialize marketing tables:", error.message);
  }
}
