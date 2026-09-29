import assert from 'node:assert/strict';
import { hasPin, setPin, verifyPin } from '../src/security/appLock';
import { buildAlertMessage, navigateToPoliceStation, toInternational } from '../src/services/emergency';
// @ts-expect-error — test-only fake, see tests/mocks/react-native.mjs
import { openedUrls } from 'react-native';

// PIN: stored as a salted hash, locked after 5 wrong tries.
assert.equal(await hasPin(), false);
await assert.rejects(setPin('12a4'), /4 to 8 digits/);
await setPin('2468');
assert.equal(await hasPin(), true);
assert.equal(await verifyPin('2468'), 'ok');
for (let i = 0; i < 4; i++) assert.equal(await verifyPin('0000'), 'wrong');
assert.equal(await verifyPin('0000'), 'locked');
assert.equal(await verifyPin('2468'), 'locked', 'even the right PIN waits out the lockout');

// Emergency helpers.
assert.equal(toInternational('0803 123 4567'), '2348031234567');
assert.equal(toInternational('+234 803 123 4567'), '2348031234567');
assert.equal(toInternational('00447700900123'), '447700900123');
const message = buildAlertMessage({
  plate: 'KSJ449',
  score: 9.4,
  location: { latitude: 6.4541, longitude: 3.3947 },
  at: new Date(2026, 0, 15, 14, 32),
});
assert.match(message, /KSJ·449 is following me \(threat 9\.4\/10\)/);
assert.match(message, /at 14:32: https:\/\/maps\.google\.com\/\?q=6\.45410,3\.39470/);
assert.equal(await navigateToPoliceStation(), true);
assert.match(openedUrls.at(-1), /google\.com\/maps\/search\/\?api=1&query=police%20station/);

console.log('✓ App lock PIN + emergency helpers');
