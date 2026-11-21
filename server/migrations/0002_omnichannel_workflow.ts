/**
 * Migration 0002 — the Chatwoot-grade inbox features that need their own
 * storage. Kept separate from 0001 so a rollback of the feature work never
 * touches the messaging foundation.
 *
 * Adds:
 *   snoozed_until          scheduled reopen (Chatwoot "Snooze")
 *   first_response_at      SLA measurement (was impossible before: nothing
 *                          recorded when an agent first answered)
 *   omnichannel_saved_views        named {name, query} filter views
 *   omnichannel_quick_replies      canned responses with {{placeholders}}
 *   omnichannel_canned_responses   per-channel template library
 *   omnichannel_sla_policies       per-channel first-response targets
 *   omnichannel_conversation_events  audit timeline for Panel 3
 */

import type { Migration } from './index';

const M: Migration = {
  id: '0002',
  name: 'omnichannel_workflow',
  notes:
    'Snooze, first-response SLA clock, saved filter views, quick replies, ' +
    'canned responses, SLA policies and the conversation audit timeline.',

  up: [
    // ── snooze ──────────────────────────────────────────────────────
    `ALTER TABLE omnichannel_conversations
       ADD COLUMN snoozed_until datetime NULL DEFAULT NULL AFTER closed_at,
       ADD COLUMN first_response_at datetime NULL DEFAULT NULL AFTER snoozed_until,
       ADD KEY idx_conv_snooze (snoozed_until),
       ADD KEY idx_conv_sla (status, first_response_at, last_inbound_at)`,

    // ── saved views ─────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS omnichannel_saved_views (
       id INT AUTO_INCREMENT PRIMARY KEY,
       name VARCHAR(120) NOT NULL,
       description VARCHAR(255) NULL,
       query_json LONGTEXT NOT NULL,
       scope VARCHAR(32) NOT NULL DEFAULT 'conversations',
       is_shared TINYINT(1) NOT NULL DEFAULT 1,
       sort_order INT NOT NULL DEFAULT 0,
       owner_user_id INT NULL,
       created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
       UNIQUE KEY uq_view_name (name)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

    // ── quick replies (shortcut /) ──────────────────────────────────
    `CREATE TABLE IF NOT EXISTS omnichannel_quick_replies (
       id INT AUTO_INCREMENT PRIMARY KEY,
       title VARCHAR(120) NOT NULL,
       body TEXT NOT NULL,
       shortcut VARCHAR(40) NULL,
       channel VARCHAR(32) NULL,
       usage_count INT NOT NULL DEFAULT 0,
       created_by INT NULL,
       created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
       UNIQUE KEY uq_qr_title (title),
       KEY idx_qr_shortcut (shortcut)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

    // ── canned responses (longer templates) ─────────────────────────
    `CREATE TABLE IF NOT EXISTS omnichannel_canned_responses (
       id INT AUTO_INCREMENT PRIMARY KEY,
       title VARCHAR(120) NOT NULL,
       body TEXT NOT NULL,
       channel VARCHAR(32) NULL,
       usage_count INT NOT NULL DEFAULT 0,
       created_by INT NULL,
       created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
       UNIQUE KEY uq_cr_title (title)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

    // ── SLA policies ────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS omnichannel_sla_policies (
       id INT AUTO_INCREMENT PRIMARY KEY,
       channel VARCHAR(32) NOT NULL,
       first_response_minutes INT NOT NULL DEFAULT 15,
       resolution_minutes INT NOT NULL DEFAULT 1440,
       UNIQUE KEY uq_sla_channel (channel)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

    `INSERT IGNORE INTO omnichannel_sla_policies (channel, first_response_minutes, resolution_minutes)
       VALUES ('facebook', 15, 1440), ('instagram', 15, 1440),
              ('whatsapp', 10, 1440), ('messenger', 15, 1440)`,

    // ── audit timeline for Panel 3 ──────────────────────────────────
    `CREATE TABLE IF NOT EXISTS omnichannel_conversation_events (
       id INT AUTO_INCREMENT PRIMARY KEY,
       conversation_id INT UNSIGNED NOT NULL,
       event_type VARCHAR(48) NOT NULL,
       actor_user_id INT NULL,
       from_value VARCHAR(190) NULL,
       to_value VARCHAR(190) NULL,
       meta LONGTEXT NULL,
       created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
       KEY idx_evt_conv (conversation_id, id),
       KEY idx_evt_type (event_type)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  ],

  down: [
    `DROP TABLE IF EXISTS omnichannel_conversation_events`,
    `DROP TABLE IF EXISTS omnichannel_sla_policies`,
    `DROP TABLE IF EXISTS omnichannel_canned_responses`,
    `DROP TABLE IF EXISTS omnichannel_quick_replies`,
    `DROP TABLE IF EXISTS omnichannel_saved_views`,
    `ALTER TABLE omnichannel_conversations
       DROP KEY idx_conv_snooze,
       DROP KEY idx_conv_sla,
       DROP COLUMN first_response_at,
       DROP COLUMN snoozed_until`,
  ],
};

export default M;