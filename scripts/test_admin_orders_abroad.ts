import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  buildAdminOrdersExportQuery,
  buildAdminOrdersListQuery,
} from '../server/utils/adminOrdersQuery.ts';

// The admin list must add the shared abroad filter to its WHERE clause and
// bind the flag as a parameter (not interpolate user input into SQL).
assert.deepEqual(
  buildAdminOrdersListQuery(["status NOT IN ('trash')"], ['seed'], 'yes'),
  {
    whereString: "WHERE status NOT IN ('trash') AND is_abroad = ?",
    params: ['seed', 1],
  },
  "abroad=yes must append a bound overseas predicate to the admin list query"
);

assert.deepEqual(
  buildAdminOrdersListQuery(["status NOT IN ('trash')"], ['seed'], 'no'),
  {
    whereString: "WHERE status NOT IN ('trash') AND is_abroad = ?",
    params: ['seed', 0],
  },
  "abroad=no must append a bound local predicate to the admin list query"
);

assert.deepEqual(
  buildAdminOrdersListQuery([], [], "yes' OR 1=1 -- "),
  { whereString: '', params: [] },
  'an unknown abroad value must add no SQL and no params'
);

// The CSV export must apply the identical filter.
const yesExport = buildAdminOrdersExportQuery(["status NOT IN ('trash')"], ['seed'], 'yes');
assert.deepEqual(
  yesExport,
  {
    whereString: "WHERE status NOT IN ('trash') AND is_abroad = ?",
    params: ['seed', 1],
  },
  'the CSV export must append the same bound abroad predicate as the list endpoint'
);
assert.deepEqual(
  buildAdminOrdersExportQuery([], [], 'bogus').params,
  [],
  'an unknown abroad value must not add params to the CSV export query'
);

// Route wiring: both endpoints must read req.query.abroad and use the builders;
// the list SELECT must expose the new columns, and the CSV must emit them.
const source = readFileSync(new URL('../server/routes/admin/orders.ts', import.meta.url), 'utf8');
const listHandler = source.slice(source.indexOf("router.get('/'"), source.indexOf("router.post('/manual'"));
const exportHandler = source.slice(source.indexOf("router.get('/export'"), source.indexOf('// GET /api/admin/orders/:id'));

assert.match(
  listHandler,
  /req\.query\.abroad/,
  'the admin list endpoint must read the abroad query parameter'
);
assert.match(
  listHandler,
  /buildAdminOrdersListQuery\(/,
  'the admin list endpoint must use the shared abroad-aware query builder'
);
assert.match(
  listHandler,
  /customer_name, phone, is_abroad, abroad_phone,/,
  'the admin list SELECT must expose is_abroad and abroad_phone'
);
assert.match(
  exportHandler,
  /req\.query as any\)\.abroad|req\.query\.abroad/,
  'the CSV export endpoint must read the abroad query parameter'
);
assert.match(
  exportHandler,
  /buildAdminOrdersExportQuery\(/,
  'the CSV export endpoint must use the shared abroad-aware query builder'
);
assert.match(
  exportHandler,
  /SELECT invoice, customer_name, phone, is_abroad, abroad_phone, total_payable/,
  'the CSV export query must select is_abroad and abroad_phone'
);
assert.match(
  exportHandler,
  /is_abroad,abroad_phone/,
  'the CSV header must include is_abroad and abroad_phone columns'
);
assert.match(
  exportHandler,
  /esc\(r\.is_abroad\), esc\(r\.abroad_phone\)/,
  'each CSV row must include escaped abroad values from the database row'
);

console.log('admin orders abroad query and CSV tests passed');
