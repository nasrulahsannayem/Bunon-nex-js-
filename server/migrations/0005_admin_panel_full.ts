import type { Migration } from './index';

export const M0005: Migration = {
  id: '0005',
  name: 'admin_panel_modal_features',
  notes:
    'Adds 13 new tables for modal-driven admin: docs, kv, admin_tokens, ' +
    'rate_limits, otp, complaints, incomplete_orders, landing_pages, ' +
    'homepage_sections, sms_log, courier_log, chat_config, visitor_sessions.',
  up: [
    `CREATE TABLE IF NOT EXISTS docs (
      id VARCHAR(32) PRIMARY KEY,
      collection VARCHAR(50) NOT NULL,
      doc JSON NOT NULL,
      indexes JSON NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_collection_id (collection, id),
      INDEX idx_doc_slug (collection, (CAST(doc->>'$.slug' AS CHAR(255))))
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS kv (
      key VARCHAR(190) PRIMARY KEY,
      value JSON NOT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS admin_tokens (
      token VARCHAR(255) PRIMARY KEY,
      type ENUM('access','refresh') NOT NULL,
      subject_id BIGINT UNSIGNED NOT NULL,
      data JSON NULL,
      expires DATETIME NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_subject (subject_id),
      INDEX idx_expires (expires)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS rate_limits (
      key VARCHAR(190) PRIMARY KEY,
      count INT UNSIGNED NOT NULL DEFAULT 0,
      window_start DATETIME NOT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS otp (
      phone VARCHAR(32) PRIMARY KEY,
      code VARCHAR(10) NOT NULL,
      attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
      expires DATETIME NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_expires (expires)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS complaints (
      id VARCHAR(32) PRIMARY KEY,
      type ENUM('product','shipping','service','payment','warranty','other') NOT NULL,
      status ENUM('new','in_progress','assigned','resolved','closed','reopened') NOT NULL DEFAULT 'new',
      segment ENUM('gold','silver','bronze','new') NOT NULL DEFAULT 'new',
      title VARCHAR(255) NOT NULL,
      description TEXT NULL,
      user_id BIGINT UNSIGNED NULL,
      assigned_to BIGINT UNSIGNED NULL,
      files JSON NULL,
      notes JSON NULL,
      sla_hours INT UNSIGNED NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_status (status),
      INDEX idx_segment (segment),
      INDEX idx_assigned (assigned_to),
      INDEX idx_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS incomplete_orders (
      id VARCHAR(32) PRIMARY KEY,
      user_id BIGINT UNSIGNED NULL,
      items JSON NOT NULL,
      total DECIMAL(10,2) NOT NULL,
      status ENUM('cart','saved','recovered','abandoned','expired') NOT NULL DEFAULT 'cart',
      recovery_link VARCHAR(255) NULL,
      sent_recovery_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_status (status),
      INDEX idx_user (user_id),
      INDEX idx_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS landing_pages (
      id VARCHAR(32) PRIMARY KEY,
      slug VARCHAR(190) NOT NULL UNIQUE,
      title VARCHAR(255) NOT NULL,
      content JSON NOT NULL,
      status ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
      seo JSON NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_slug (slug),
      INDEX idx_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS homepage_sections (
      id VARCHAR(32) PRIMARY KEY,
      type ENUM('hero','products','categories','banners','video','testimonials','custom_html') NOT NULL,
      config JSON NOT NULL,
      position INT UNSIGNED NOT NULL DEFAULT 0,
      status ENUM('active','inactive') NOT NULL DEFAULT 'active',
      schedule JSON NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_position (position),
      INDEX idx_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS sms_log (
      id VARCHAR(32) PRIMARY KEY,
      to_phone VARCHAR(32) NOT NULL,
      from_number VARCHAR(32) NULL,
      body TEXT NOT NULL,
      status ENUM('pending','sent','delivered','failed','optout') NOT NULL DEFAULT 'pending',
      gateway ENUM('muthofun','bulksm','manual') NOT NULL,
      message_id VARCHAR(255) NULL,
      error_code VARCHAR(64) NULL,
      event_type VARCHAR(50) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_to (to_phone),
      INDEX idx_status (status),
      INDEX idx_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS courier_log (
      id VARCHAR(32) PRIMARY KEY,
      order_id BIGINT UNSIGNED NOT NULL,
      courier ENUM('steadfast','sfpar','keysui','cat','logistics') NOT NULL,
      tracking_id VARCHAR(255) NULL,
      status ENUM('booked','picked_up','in_transit','delivered','returned','failed') NOT NULL,
      notes JSON NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_order (order_id),
      INDEX idx_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS chat_config (
      id VARCHAR(32) PRIMARY KEY,
      key VARCHAR(190) NOT NULL UNIQUE,
      value JSON NOT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS visitor_sessions (
      id VARCHAR(32) PRIMARY KEY,
      session_id VARCHAR(190) NOT NULL UNIQUE,
      ip VARCHAR(45) NOT NULL,
      user_agent TEXT NULL,
      country VARCHAR(2) NULL,
      city VARCHAR(100) NULL,
      path VARCHAR(500) NULL,
      referrer VARCHAR(500) NULL,
      last_activity DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_session (session_id),
      INDEX idx_last_activity (last_activity)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  ],
  down: [
    'DROP TABLE IF EXISTS visitor_sessions',
    'DROP TABLE IF EXISTS chat_config',
    'DROP TABLE IF EXISTS courier_log',
    'DROP TABLE IF EXISTS sms_log',
    'DROP TABLE IF EXISTS homepage_sections',
    'DROP TABLE IF EXISTS landing_pages',
    'DROP TABLE IF EXISTS incomplete_orders',
    'DROP TABLE IF EXISTS complaints',
    'DROP TABLE IF EXISTS otp',
    'DROP TABLE IF EXISTS rate_limits',
    'DROP TABLE IF EXISTS admin_tokens',
    'DROP TABLE IF EXISTS kv',
    'DROP TABLE IF EXISTS docs',
  ],
};

export default M0005;
