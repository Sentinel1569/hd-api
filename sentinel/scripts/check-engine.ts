/**
 * Day 8's "run the function with sample data", as one command:
 *
 *   npx tsx scripts/check-engine.ts
 *
 * Prints ✓ or ✗ for every check in the Build Companion that has a number in it,
 * plus the Day 9, Week 6 and SDR rules. Exits with an error if any check fails.
 */
import { THRESHOLDS } from '../src/constants/theme';
import { DEMO_PLATE, DEMO_ORIGIN, demoPosition } from '../src/engine/demo';
import { offsetByKm } from '../src/engine/geo';
import {
  assessAllVehicles,
  assessVehicle,
  computeR2,
  computeZoneId,
  describeThreat,
  formatPlate,
  normalizePlate,
  scoreFromPoints,
} from '../src/engine/patternDetection';
import { recheckQuestion, scoreAfterAnswers, sdrVerdict, spellPlate, summariseSdr } from '../src/engine/sdr';
import type { Sighting } from '../src/types';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (!pass) failures++;
  const shown = typeof actual === 'string' ? actual : JSON.stringify(actual);
  console.log(`  ${pass ? '✓' : '✗'} ${label.padEnd(52)} → ${shown}${pass ? '' : `   (expected ${JSON.stringify(expected)})`}`);
}
const section = (title: string) => console.log(`\n${title}`);

// Sample data: a drive starting in Lagos. Times are phone-local.
const ORIGIN = { latitude: 6.4541, longitude: 3.3947 };
const at = (hours: number, minutes: number) => new Date(2026, 0, 15, hours, minutes).getTime();
let nextId = 0;
function seen(plate: string, time: number, northKm: number, eastKm: number): Sighting {
  const p = offsetByKm(ORIGIN, northKm, eastKm);
  return {
    id: String(nextId++),
    sessionId: 'check',
    plate,
    seenAt: time,
    latitude: p.latitude,
    longitude: p.longitude,
    zoneId: computeZoneId(p.latitude, p.longitude),
    source: 'manual',
  };
}
const noGps = (plate: string, time: number): Sighting => ({
  ...seen(plate, time, 0, 0),
  latitude: null,
  longitude: null,
  zoneId: null,
});
const score = (sightings: Sighting[], options = {}) => assessVehicle(sightings, options).score;
const oneDecimal = (n: number) => n.toFixed(1);
const r2 = (points: Parameters<typeof computeR2>[0]) => Math.round((computeR2(points) ?? NaN) * 1000) / 1000;

console.log('SENTINEL engine check');

section('Day 8 — threat score');
const followed = [
  seen('KSJ449', at(11, 0), 0, 0),
  seen('KSJ449', at(11, 6), 1, 0),
  seen('KSJ449', at(11, 13), 1, 1),
  seen('KSJ449', at(11, 20), 2, 1),
];
check('4 sightings, 4 zones, 20 min', oneDecimal(score(followed)), '9.0');
const sameRoad = [seen('ABX211', at(11, 0), 0, 0), seen('ABX211', at(11, 4), 0.8, 0.01), seen('ABX211', at(11, 9), 1.6, 0.02)];
check('3 sightings along the same road', oneDecimal(score(sameRoad)), '1.2');
check('Notification line for the 4-zone vehicle', describeThreat(assessVehicle(followed)), 'KSJ·449 · 4 SIGHTINGS · 20 MIN · 2.2KM SPREAD');
check('Points → score curve (0,1,2,3,4,5,6,8 points)', [0, 1, 2, 3, 4, 5, 6, 8].map((p) => Math.round(scoreFromPoints(p) * 10) / 10), [0, 3.2, 5.4, 6.8, 7.8, 8.5, 9, 9.5]);
check('R² of a road running due north', r2([ORIGIN, offsetByKm(ORIGIN, 1, 0), offsetByKm(ORIGIN, 2, 0)]), 1);
check('R² of a square (no straight line at all)', r2([0, 1, 2, 3].map((i) => demoPosition(i, ORIGIN))), 0);

section('Day 9 — test button (calm → watch → alert), tapped at 17:00 in rush hour');
const demo: Sighting[] = [];
for (const expected of ['calm', 'watch', 'alert']) {
  const p = demoPosition(demo.length, DEMO_ORIGIN);
  demo.push({ ...seen(DEMO_PLATE, at(17, demo.length), 0, 0), latitude: p.latitude, longitude: p.longitude, source: 'demo' });
  const a = assessVehicle(demo);
  check(`Tap ${demo.length} → ${expected}`, `${a.level} (${a.score.toFixed(1)})`, `${expected} (${[0, 5.4, 7.8][demo.length - 1].toFixed(1)})`);
}
const sameSpot = [0, 1, 2, 3, 4].map((m) => seen('DSK101', at(11, m), 0, 0));
check('5 logs in one spot can never reach ALERT', assessVehicle(sameSpot).level, 'watch');

section('Week 6 — false-positive filters');
check('Whitelisted plate logged 10 times', score([...Array(10)].map((_, i) => seen('WHT001', at(11, i), i, i % 2)), { whitelist: ['wht-001'] }), 0);
const rushHour = followed.map((s, i) => ({ ...s, seenAt: at(7, 30 + i * 6) }));
check('Same pattern: rush hour (7:30) scores lower', score(rushHour) < score(followed), true);
check('  …rush-hour score', score(rushHour), 8.2);
const smallLoop = [0, 1, 2, 3, 4, 5].map((i) => seen('LOP777', at(11, i * 3), [0, 0.4, 0.4, 0][i % 4], [0, 0, 0.4, 0.4][i % 4]));
check('Seen 6 times but within 0.6 km → held below ALERT', `${assessVehicle(smallLoop).level} (${score(smallLoop)})`, 'watch (6.9)');
const home = computeZoneId(ORIGIN.latitude, ORIGIN.longitude);
const neighbour = [0, 10, 20, 30, 40, 50].map((m) => seen('NBR555', at(11, m), 0, 0));
check("Neighbour's car 6× at home (known zone)", score(neighbour, { knownZones: [home] }), 0);
const tailFromHome = [...neighbour.slice(0, 3), seen('NBR555', at(11, 40), 1.2, 0), seen('NBR555', at(11, 50), 1.2, 1.2)];
check('Same car at home AND 2 other zones', assessVehicle(tailFromHome, { knownZones: [home] }).level, 'alert');
check('3 logs with no GPS', `${assessVehicle([0, 5, 10].map((m) => noGps('NOG123', at(11, m)))).level}`, 'watch');
const stale = [seen('OLD999', at(8, 0), 0, 0), seen('OLD999', at(8, 5), 1, 0), seen('OLD999', at(11, 0), 1, 1)];
check('Sightings > 2 h before the latest are ignored', assessVehicle(stale).sightings, 1);
check('Everything cleared by an SDR', score(followed.map((s) => ({ ...s, cleared: true }))), 0);
check('Highest threat is listed first', assessAllVehicles([...sameRoad, ...followed]).map((a) => a.plate), ['KSJ449', 'ABX211']);

section('Plates');
check('"ksj-449" and "KSJ 449" match', normalizePlate('ksj-449') === normalizePlate('KSJ 449'), true);
check('Display format', formatPlate('ksj449'), 'KSJ·449');
check('Nigerian format', formatPlate('ABC-123DE'), 'ABC·123·DE');
check('Spoken', spellPlate('KSJ449'), 'K S J, 4 4 9');
check('Recheck question', recheckQuestion('KSJ449'), 'IS KSJ · 449 STILL VISIBLE?');

section('Days 13–14 — SDR scoring and verdicts (starting from 7.8)');
const Y = true;
const N = false;
check('3 YES, 2 NO', `${oneDecimal(scoreAfterAnswers(7.8, [Y, Y, Y, N, N]))} ${sdrVerdict(scoreAfterAnswers(7.8, [Y, Y, Y, N, N]), [Y, Y, Y, N, N])}`, '9.0 confirmed');
check('…same answers in another order', oneDecimal(scoreAfterAnswers(7.8, [N, Y, N, Y, Y])), '9.0');
check('2 YES, 3 NO', `${scoreAfterAnswers(7.8, [Y, Y, N, N, N])} ${sdrVerdict(5.9, [Y, Y, N, N, N])}`, '5.9 inconclusive');
check('1 YES, 4 NO', `${scoreAfterAnswers(7.8, [Y, N, N, N, N])} ${sdrVerdict(1.8, [Y, N, N, N, N])}`, '1.8 clear');
check('5 YES / 4 YES / 0 YES', [[Y, Y, Y, Y, Y], [Y, Y, Y, Y, N], [N, N, N, N, N]].map((a) => scoreAfterAnswers(7.8, a)), [9.9, 9.8, 0.4]);
check('Very high start, only 1 YES → not confirmed', sdrVerdict(scoreAfterAnswers(9.9, [Y, N, N, N, N]), [Y, N, N, N, N]), 'inconclusive');
const summary = summariseSdr('KSJ449', 7.8, [Y, N, Y, N, Y]);
check('Result card rows', summary.steps.map((s) => `${s.maneuver.name}: ${s.label}`), [
  'BOX TURN: ⚠ REAPPEARED ×2.5',
  'SPEED CHECK: ✓ NOT SEEN',
  'ROUNDABOUT LOOP: ⚠ REAPPEARED ×2.5',
  'SAFE STOP: ✓ NOT SEEN',
  'EXIT AND REJOIN: ⚠ REAPPEARED ×2.5',
]);
check('Watch/alert thresholds', [THRESHOLDS.WATCH, THRESHOLDS.ALERT], [4, 7]);

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`);
if (failures > 0) process.exit(1);
