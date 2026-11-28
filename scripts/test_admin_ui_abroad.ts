import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { getAbroadDisplayPhone } from '../server/utils/abroadOrders.ts';

assert.equal(getAbroadDisplayPhone({ is_abroad: 1, abroad_phone: '+966501234567', phone: '01700000000' }), '+966501234567');
assert.equal(getAbroadDisplayPhone({ is_abroad: 0, abroad_phone: '+966501234567', phone: '01700000000' }), '01700000000');

const source = readFileSync(new URL('../src/pages/admin/OrdersManager.tsx', import.meta.url), 'utf8');

assert.match(source, /getAbroadDisplayPhone/, 'admin UI must use the shared abroad display helper');
assert.match(source, /<td[^>]*>{getAbroadDisplayPhone\(order\)}<\/td>/, 'desktop order list must show the abroad display phone');
assert.match(source, /<div[^>]*>{getAbroadDisplayPhone\(order\)}<\/div>/, 'mobile order card must show the abroad display phone');
assert.match(source, /selectedDisplayPhone = selectedOrder \? getAbroadDisplayPhone\(selectedOrder\) : ''/, 'drawer must derive one display phone from the order');
assert.match(source, /href=\{`tel:\$\{selectedDisplayPhone\}`\}/, 'call action must use the abroad display phone');
assert.match(source, /<WAChatModal phone=\{selectedDisplayPhone\}/, 'WhatsApp modal must receive the abroad display phone');
assert.match(source, /Phone: \{selectedDisplayPhone\}/, 'ORDER JOURNEY header must show the abroad display phone');
assert.match(source, /Courier Journey[\s\S]{0,1400}Phone: \{selectedDisplayPhone\}/, 'courier journey timeline must show the abroad display phone');
assert.match(source, /Status[\s\S]{0,700}Phone: \{selectedDisplayPhone\}/, 'status area must show the abroad display phone');

console.log('admin UI abroad phone display tests passed');
