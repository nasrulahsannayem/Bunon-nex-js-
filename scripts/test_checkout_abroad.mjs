import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/pages/Checkout.tsx', import.meta.url), 'utf8');

assert.match(source, /id="checkout-abroad-anchor"/, 'abroad option must be rendered in the checkout form');
assert.match(source, /id="checkout-abroad-phone-anchor"/, 'abroad phone field must be rendered when abroad is selected');
assert.match(source, /abroadPhone: formData\.abroad \? formData\.abroadPhone/, 'checkout payload must include abroadPhone');
assert.match(source, /if \(formData\.abroad\)/, 'submit must validate abroadPhone');
