/**
 * Test data for the "+ LOG VEHICLE MANUALLY" button on Day 9, before GPS exists.
 *
 * Logging the same plate three times at your desk can never reach ALERT: all
 * three sightings are in one spot, and the Week 6 spread rule holds anything
 * seen over less than 1.5 km below ALERT. So each demo sighting is placed at
 * the next corner of a 1.2 km square around the origin, the way a real tail
 * would show up as you drive. Tapping three times goes calm → watch → alert.
 */
import { offsetByKm, type LatLng } from './geo';

export const DEMO_PLATE = 'KSJ449';

/** Lagos Island — only used when there is no GPS fix yet. */
export const DEMO_ORIGIN: LatLng = { latitude: 6.4541, longitude: 3.3947 };

const DEMO_LEG_KM = 1.2;
const SQUARE_CORNERS: [number, number][] = [
  [0, 0],
  [DEMO_LEG_KM, 0],
  [DEMO_LEG_KM, DEMO_LEG_KM],
  [0, DEMO_LEG_KM],
];

/** Where the demo sighting number `index` (0, 1, 2, …) is placed. */
export function demoPosition(index: number, origin: LatLng = DEMO_ORIGIN): LatLng {
  const [northKm, eastKm] = SQUARE_CORNERS[index % SQUARE_CORNERS.length];
  return offsetByKm(origin, northKm, eastKm);
}
