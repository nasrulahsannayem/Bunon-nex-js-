import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildAbroadOrderInsertFields } from '../server/utils/abroadOrderInsert.ts';

// (a) Overseas customer: normalized international phone must be persisted.
assert.deepEqual(
  buildAbroadOrderInsertFields({ abroad: true, abroadPhone: '+966 50 123-4567' }),
  {
    columnsSql: 'is_abroad, abroad_phone',
    placeholdersSql: '?, ?',
    values: [1, '+966501234567'],
  },
  'an overseas checkout must add normalized abroad fields to the order INSERT'
);

// (b) Local customer: flag 0 and a null phone, never a leaked abroad phone.
assert.deepEqual(
  buildAbroadOrderInsertFields({ abroad: false, abroadPhone: '+966501234567' }),
  {
    columnsSql: 'is_abroad, abroad_phone',
    placeholdersSql: '?, ?',
    values: [0, null],
  },
  'a local checkout must store is_abroad=0 and a null abroad phone'
);

// (c) Invalid overseas phone: reject before any insert can happen.
assert.throws(
  () => buildAbroadOrderInsertFields({ abroad: true, abroadPhone: '123' }),
  /abroad phone must include a valid country code/,
  'an invalid overseas phone must be rejected before the DB write'
);

// Route integration: the payment route must call the normalizer before its INSERT,
// bind both columns with placeholders, and validate before any DB write.
const paymentSource = readFileSync(new URL('../server/routes/payment.ts', import.meta.url), 'utf8');
const insertStart = paymentSource.indexOf('INSERT INTO bf_orders');
assert.ok(insertStart >= 0, 'the payment route must contain the bf_orders INSERT');
const insertSql = paymentSource.slice(insertStart, paymentSource.indexOf(');', insertStart));
assert.match(insertSql, /\bis_abroad\b/, 'the bf_orders INSERT must include is_abroad');
assert.match(insertSql, /\babroad_phone\b/, 'the bf_orders INSERT must include abroad_phone');
assert.match(
  insertSql,
  /\?,\s*\?\s*\)/,
  'the abroad columns must use bound placeholders in the VALUES list'
);
assert.match(
  paymentSource,
  /normalizeAbroadCustomer\(customer\)/,
  'the payment route must normalize abroad customer data via the shared helper'
);

const normalizedCall = paymentSource.indexOf('normalizeAbroadCustomer(customer)');
const firstDbWrite = paymentSource.indexOf('dbPool.execute(');
assert.ok(
  normalizedCall >= 0 && normalizedCall < firstDbWrite,
  'abroad phone validation must run before any database write'
);
const validationBlock = paymentSource.slice(
  normalizedCall,
  paymentSource.indexOf('const generatedOrderId', normalizedCall)
);
assert.match(
  validationBlock,
  /catch[\s\S]*status\(400\)\.json\(/,
  'invalid overseas phone input must be answered with HTTP 400 before any INSERT'
);

console.log('payment abroad order tests passed');
