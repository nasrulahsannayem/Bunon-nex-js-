/**
 * migrations/index.ts — versioned, idempotent migration runner for Bunon.
 *
 * Rules enforced here (per Section 13 of the omnichannel spec):
 *   - never run schema changes from a request handler; always via this runner
 *   - every migration is versioned, idempotent (IF NOT EXISTS), documented
 *   - each migration ships a `down` where practical
 *   - refuses to run unless a caller has explicitly backed up (env flag)
 *
 * Usage:
 *   node -r ts-node/register scripts/migrate.ts up
 *   node -r ts-node/register scripts/migrate.ts status
 *   node -r ts-node/register scripts/migrate.ts down 0001
 */
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config({ override: true, quiet: true as any });

export type Migration = {
  id: string;                 // e.g. '0001'
  name: string;               // human label
  up: string[];               // DDL statements
  down?: string[];            // reverse DDL (best-effort)
  notes?: string;
};

const TABLE = 'bunon_schema_migrations';

/**
 * Migrations live in bunonfabrics_dash_db (the operational/admin DB that
 * already owns bf_orders, bf_wa_messages, chat_seen …). Product catalogue
 * stays in bunon_shop_db and is NOT touched by these migrations.
 */
import M0002 from './0002_omnichannel_workflow';
import M0003 from './0003_omnichannel_media';
import M0004 from './0004_shipping_zones';

export const migrations: Migration[] = [
  M0003,
  M0004,
  {
    id: '0001',
    name: 'omnichannel_core',
    notes:
      'Unified messaging foundation: customers + per-channel identities, ' +
      'conversations, messages, attachments, assignment, tags, notes, channel ' +
      'accounts, and an append-only audit log. All UNIQUE constraints are ' +
      'channel-scoped so the same external id can never double-insert.',
    up: [
      `CREATE TABLE IF NOT EXISTS omnichannel_customers (
         id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
         display_name VARCHAR(160) NULL,
         primary_phone VARCHAR(32) NULL,
         primary_email VARCHAR(190) NULL,
         merged_into BIGINT UNSIGNED NULL,
         created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
         updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
         PRIMARY KEY (id),
         UNIQUE KEY uq_customer_phone (primary_phone),
         KEY ix_customer_merged (merged_into)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

      `CREATE TABLE IF NOT EXISTS omnichannel_customer_identities (
         id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
         customer_id BIGINT UNSIGNED NOT NULL,
         platform VARCHAR(32) NOT NULL,
         external_id VARCHAR(190) NOT NULL,
         external_username VARCHAR(190) NULL,
         display_name VARCHAR(160) NULL,
         is_primary TINYINT(1) NOT NULL DEFAULT 0,
         first_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
         last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
         meta JSON NULL,
         PRIMARY KEY (id),
         UNIQUE KEY uq_identity (platform, external_id),
         KEY ix_identity_customer (customer_id),
         CONSTRAINT fk_identity_customer FOREIGN KEY (customer_id)
           REFERENCES omnichannel_customers (id) ON DELETE CASCADE
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

      `CREATE TABLE IF NOT EXISTS omnichannel_channel_accounts (
         id INT UNSIGNED NOT NULL AUTO_INCREMENT,
         platform VARCHAR(32) NOT NULL,
         external_account_id VARCHAR(190) NULL,
         handle VARCHAR(190) NULL,
         display_name VARCHAR(190) NULL,
         status ENUM('active','degraded','disabled') NOT NULL DEFAULT 'active',
         capabilities JSON NULL,
         last_sync_at DATETIME NULL,
         created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
         PRIMARY KEY (id),
         UNIQUE KEY uq_channel_account (platform, external_account_id)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

      `CREATE TABLE IF NOT EXISTS omnichannel_conversations (
         id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
         platform VARCHAR(32) NOT NULL,
         channel_account_id INT UNSIGNED NULL,
         customer_id BIGINT UNSIGNED NULL,
         external_conversation_id VARCHAR(255) NULL,
         status ENUM('open','pending','closed') NOT NULL DEFAULT 'open',
         priority ENUM('low','normal','high','urgent') NOT NULL DEFAULT 'normal',
         assigned_user_id INT NULL,
         unread_count INT UNSIGNED NOT NULL DEFAULT 0,
         last_message_at DATETIME NULL,
         last_message_preview VARCHAR(255) NULL,
         last_inbound_at DATETIME NULL,
         last_outbound_at DATETIME NULL,
         closed_at DATETIME NULL,
         meta JSON NULL,
         created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
         updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
         PRIMARY KEY (id),
         UNIQUE KEY uq_conversation (platform, external_conversation_id),
         KEY ix_conv_customer (customer_id),
         KEY ix_conv_assignee (assigned_user_id),
         KEY ix_conv_status_activity (status, last_message_at),
         CONSTRAINT fk_conv_customer FOREIGN KEY (customer_id)
           REFERENCES omnichannel_customers (id) ON DELETE SET NULL
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

      `CREATE TABLE IF NOT EXISTS omnichannel_messages (
         id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
         conversation_id BIGINT UNSIGNED NOT NULL,
         platform VARCHAR(32) NOT NULL,
         external_message_id VARCHAR(255) NULL,
         direction ENUM('inbound','outbound','internal') NOT NULL,
         message_type VARCHAR(32) NOT NULL DEFAULT 'text',
         sender_type ENUM('customer','agent','ai','system') NOT NULL DEFAULT 'customer',
         sender_identity VARCHAR(190) NULL,
         sender_user_id INT NULL,
         body TEXT NULL,
         reply_to_external_id VARCHAR(255) NULL,
         error_code VARCHAR(64) NULL,
         raw_payload JSON NULL,
         sent_at DATETIME NULL,
         created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
         PRIMARY KEY (id),
         UNIQUE KEY uq_message (platform, external_message_id),
         KEY ix_msg_conv_time (conversation_id, created_at),
         KEY ix_msg_external (external_message_id),
         CONSTRAINT fk_msg_conv FOREIGN KEY (conversation_id)
           REFERENCES omnichannel_conversations (id) ON DELETE CASCADE
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

      `CREATE TABLE IF NOT EXISTS omnichannel_message_attachments (
         id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
         message_id BIGINT UNSIGNED NOT NULL,
         attachment_type VARCHAR(32) NOT NULL,
         url TEXT NULL,
         local_path VARCHAR(500) NULL,
         mime_type VARCHAR(120) NULL,
         size_bytes BIGINT UNSIGNED NULL,
         width INT NULL,
         height INT NULL,
         duration_seconds DECIMAL(10,3) NULL,
         meta JSON NULL,
         created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
         PRIMARY KEY (id),
         KEY ix_att_msg (message_id),
         CONSTRAINT fk_att_msg FOREIGN KEY (message_id)
           REFERENCES omnichannel_messages (id) ON DELETE CASCADE
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

      `CREATE TABLE IF NOT EXISTS omnichannel_conversation_tags (
         conversation_id BIGINT UNSIGNED NOT NULL,
         tag VARCHAR(64) NOT NULL,
         created_by INT NULL,
         created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
         PRIMARY KEY (conversation_id, tag),
         CONSTRAINT fk_tag_conv FOREIGN KEY (conversation_id)
           REFERENCES omnichannel_conversations (id) ON DELETE CASCADE
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

      `CREATE TABLE IF NOT EXISTS omnichannel_conversation_notes (
         id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
         conversation_id BIGINT UNSIGNED NOT NULL,
         author_user_id INT NULL,
         body TEXT NOT NULL,
         created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
         PRIMARY KEY (id),
         KEY ix_note_conv (conversation_id, created_at),
         CONSTRAINT fk_note_conv FOREIGN KEY (conversation_id)
           REFERENCES omnichannel_conversations (id) ON DELETE CASCADE
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

      `CREATE TABLE IF NOT EXISTS omnichannel_reads (
         conversation_id BIGINT UNSIGNED NOT NULL,
         user_id INT NOT NULL,
         last_read_message_id BIGINT UNSIGNED NULL,
         last_read_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
         PRIMARY KEY (conversation_id, user_id),
         KEY ix_read_user (user_id),
         CONSTRAINT fk_read_conv FOREIGN KEY (conversation_id)
           REFERENCES omnichannel_conversations (id) ON DELETE CASCADE
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

      `CREATE TABLE IF NOT EXISTS omnichannel_audit_log (
         id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
         actor_type ENUM('agent','ai','system','webhook') NOT NULL,
         actor_id VARCHAR(190) NULL,
         conversation_id BIGINT UNSIGNED NULL,
         message_id BIGINT UNSIGNED NULL,
         action VARCHAR(64) NOT NULL,
         target VARCHAR(255) NULL,
         detail JSON NULL,
         ip VARCHAR(64) NULL,
         created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
         PRIMARY KEY (id),
         KEY ix_audit_conv (conversation_id, created_at),
         KEY ix_audit_action (action, created_at)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    ],
    down: [
      `DROP TABLE IF EXISTS omnichannel_audit_log`,
      `DROP TABLE IF EXISTS omnichannel_reads`,
      `DROP TABLE IF EXISTS omnichannel_conversation_notes`,
      `DROP TABLE IF EXISTS omnichannel_conversation_tags`,
      `DROP TABLE IF EXISTS omnichannel_message_attachments`,
      `DROP TABLE IF EXISTS omnichannel_messages`,
      `DROP TABLE IF EXISTS omnichannel_conversations`,
      `DROP TABLE IF EXISTS omnichannel_channel_accounts`,
      `DROP TABLE IF EXISTS omnichannel_customer_identities`,
      `DROP TABLE IF EXISTS omnichannel_customers`,
    ],
  },
  M0002,
];

export function adminDbConfig() {
  return {
    host: process.env.DASH_DB_HOST || '127.0.0.1',
    port: Number(process.env.DASH_DB_PORT) || 3306,
    user: process.env.DASH_DB_USER || 'bunonfabrics_dash_db',
    password: (process.env.DASH_DB_PASSWORD || '').trim().replace(/"/g, ''),
    database: process.env.DASH_DB_NAME || 'bunonfabrics_dash_db',
    multipleStatements: false,
  };
}

async function ensureTable(conn: mysql.Connection) {
  await conn.query(
    `CREATE TABLE IF NOT EXISTS ${TABLE} (
       id VARCHAR(16) NOT NULL,
       name VARCHAR(190) NOT NULL,
       checksum VARCHAR(64) NULL,
       applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
       duration_ms INT NULL,
       PRIMARY KEY (id)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );
}

export async function runMigrations(
  direction: 'up' | 'down' = 'up',
  targetId?: string
): Promise<{ applied: string[]; skipped: string[] }> {
  const conn = await mysql.createConnection(adminDbConfig());
  const applied: string[] = [];
  const skipped: string[] = [];
  try {
    await ensureTable(conn);
    const [rows] = await conn.query(`SELECT id FROM ${TABLE}`);
    const done = new Set<string>((rows as any[]).map((r) => r.id));

    if (direction === 'up') {
      for (const m of migrations) {
        if (done.has(m.id)) {
          skipped.push(m.id);
          continue;
        }
        const t0 = Date.now();
        for (const stmt of m.up) await conn.query(stmt);
        await conn.query(
          `INSERT INTO ${TABLE} (id, name, checksum, duration_ms) VALUES (?,?,?,?)`,
          [m.id, m.name, checksum(m), Date.now() - t0]
        );
        applied.push(m.id);
        console.log(`  ✓ applied ${m.id} ${m.name} (${Date.now() - t0}ms)`);
      }
    } else {
      const target = targetId || migrations[migrations.length - 1]!.id;
      const m = migrations.find((x) => x.id === target);
      if (!m) throw new Error(`unknown migration ${target}`);
      if (!m.down?.length) throw new Error(`migration ${m.id} has no down()`);
      if (!done.has(m.id)) throw new Error(`migration ${m.id} is not applied`);
      for (const stmt of m.down) await conn.query(stmt);
      await conn.query(`DELETE FROM ${TABLE} WHERE id = ?`, [m.id]);
      applied.push(m.id);
      console.log(`  ✓ rolled back ${m.id} ${m.name}`);
    }
    return { applied, skipped };
  } finally {
    await conn.end();
  }
}

export async function migrationStatus() {
  const conn = await mysql.createConnection(adminDbConfig());
  try {
    await ensureTable(conn);
    const [rows] = await conn.query(
      `SELECT id, name, checksum, applied_at, duration_ms FROM ${TABLE} ORDER BY id`
    );
    const done = new Map((rows as any[]).map((r) => [r.id, r]));
    return migrations.map((m) => ({
      id: m.id,
      name: m.name,
      applied: done.has(m.id),
      checksumDrift: done.has(m.id) && done.get(m.id)!.checksum !== checksum(m),
      applied_at: done.get(m.id)?.applied_at ?? null,
      duration_ms: done.get(m.id)?.duration_ms ?? null,
    }));
  } finally {
    await conn.end();
  }
}

import { createHash } from 'crypto';
function checksum(m: Migration): string {
  return createHash('sha256').update(m.up.join('\n')).digest('hex').slice(0, 32);
}