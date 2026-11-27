import type { Migration } from './index';

export const M0006: Migration = {
  id: '0006',
  name: 'abroad_orders',
  notes:
    'Adds optional overseas-order metadata to bf_orders. is_abroad=1 marks an ' +
    'abroad checkout; abroad_phone stores the international number when supplied.',
  up: [
    `ALTER TABLE bf_orders ADD COLUMN IF NOT EXISTS is_abroad TINYINT(1) NOT NULL DEFAULT 0 AFTER customer_type`,
    `ALTER TABLE bf_orders ADD COLUMN IF NOT EXISTS abroad_phone VARCHAR(32) NULL AFTER is_abroad`,
    `ALTER TABLE bf_orders ADD INDEX IF NOT EXISTS idx_bf_orders_abroad (is_abroad)`,
  ],
  down: [
    `ALTER TABLE bf_orders DROP INDEX IF EXISTS idx_bf_orders_abroad`,
    `ALTER TABLE bf_orders DROP COLUMN IF EXISTS abroad_phone`,
    `ALTER TABLE bf_orders DROP COLUMN IF EXISTS is_abroad`,
  ],
};

export default M0006;
