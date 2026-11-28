import assert from 'node:assert/strict';
import {
  buildAbroadOrderFilter,
  getAbroadDisplayPhone,
  isAbroadOrder,
  normalizeAbroadCustomer,
} from '../server/utils/abroadOrders.ts';

assert.deepEqual(
  normalizeAbroadCustomer({ abroad: true, abroadPhone: '+966 50 123-4567' }),
  { isAbroad: 1, abroadPhone: '+966501234567' },
  'an overseas checkout must store a normalized international phone number'
);

assert.deepEqual(
  normalizeAbroadCustomer({ abroad: false, abroadPhone: '+966501234567' }),
  { isAbroad: 0, abroadPhone: null },
  'a local checkout must not store an overseas phone number'
);

assert.deepEqual(
  normalizeAbroadCustomer({ abroad: true, abroadPhone: '' }),
  { isAbroad: 1, abroadPhone: null },
  'an overseas checkout with no phone must not store an empty phone value'
);

assert.throws(
  () => normalizeAbroadCustomer({ abroad: true, abroadPhone: '123' }),
  /abroad phone/i,
  'an overseas checkout must reject a phone number that is too short'
);

assert.deepEqual(
  buildAbroadOrderFilter('yes'),
  { clause: ' AND is_abroad = ?', params: [1] },
  'the admin overseas filter must use a bound parameter for overseas orders'
);

assert.deepEqual(
  buildAbroadOrderFilter('no'),
  { clause: ' AND is_abroad = ?', params: [0] },
  'the admin local filter must use a bound parameter for local orders'
);

assert.deepEqual(
  buildAbroadOrderFilter('all'),
  { clause: '', params: [] },
  'the default admin filter must not restrict orders'
);

assert.deepEqual(
  buildAbroadOrderFilter("yes' OR 1=1 -- "),
  { clause: '', params: [] },
  'an unknown admin filter value must not alter the query'
);

assert.equal(isAbroadOrder({ is_abroad: 1 }), true, 'a numeric overseas flag must be detected');
assert.equal(isAbroadOrder({ is_abroad: '0' }), false, 'a string local flag must be detected');

assert.equal(
  getAbroadDisplayPhone({ is_abroad: 1, abroad_phone: '+966501234567', phone: '01712000000' }),
  '+966501234567',
  'an overseas order must display the international phone number'
);

assert.equal(
  getAbroadDisplayPhone({ is_abroad: 0, abroad_phone: '+966501234567', phone: '01712000000' }),
  '01712000000',
  'a local order must display the local phone number'
);

console.log('abroad order behavior tests passed');
