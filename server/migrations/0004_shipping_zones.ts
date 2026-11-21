import mysql from 'mysql2/promise';

export const M0004 = {
  id: '0004',
  name: 'shipping_zones',
  notes: 'Add shipping zone table with inside Dhaka (80 BDT) and outside Dhaka (150 BDT) tiers.',
  up: [
    // Shipping zones: 1 = inside Dhaka (80 BDT), 2 = outside Dhaka (150 BDT)
    `CREATE TABLE IF NOT EXISTS shipping_zones (
       id INT UNSIGNED NOT NULL AUTO_INCREMENT,
       name VARCHAR(100) NOT NULL,
       code VARCHAR(50) NOT NULL,
       charge_inside INT NOT NULL DEFAULT 80,
       charge_outside INT NOT NULL DEFAULT 150,
       is_active TINYINT(1) NOT NULL DEFAULT 1,
       created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
       updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
       PRIMARY KEY (id),
       UNIQUE KEY uq_zone_code (code)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `INSERT INTO shipping_zones (name, code, charge_inside, charge_outside, is_active)
     VALUES ('ঢাকা ভিতরে', 'inside_dhaka', 80, 150, 1)
     ON DUPLICATE KEY UPDATE name = VALUES(name), is_active = VALUES(is_active)`,
  ],
  down: [
    `DROP TABLE IF EXISTS shipping_zones`,
  ],
};

module.exports = M0004;
