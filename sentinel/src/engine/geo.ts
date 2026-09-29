/** Small, dependency-free geometry helpers used by the threat engine. */

export interface LatLng {
  latitude: number;
  longitude: number;
}

const EARTH_RADIUS_KM = 6371;
/** Kilometres per degree of latitude (and of longitude at the equator). */
export const KM_PER_DEGREE = (Math.PI / 180) * EARTH_RADIUS_KM;

export const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Great-circle distance between two points, in km (haversine formula). */
export function distanceKm(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Distance between the two furthest-apart points, in km. */
export function maxSpreadKm(points: readonly LatLng[]): number {
  let max = 0;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      max = Math.max(max, distanceKm(points[i], points[j]));
    }
  }
  return max;
}

/**
 * Flattens points onto an x/y grid in km around their average position.
 * Accurate to well under 1% across a city, which is all the engine needs.
 */
export function toLocalKm(points: readonly LatLng[]): { x: number; y: number }[] {
  if (points.length === 0) return [];
  const lat0 = points.reduce((sum, p) => sum + p.latitude, 0) / points.length;
  const lng0 = points.reduce((sum, p) => sum + p.longitude, 0) / points.length;
  const kmPerLngDegree = KM_PER_DEGREE * Math.cos(toRadians(lat0));
  return points.map((p) => ({
    x: (p.longitude - lng0) * kmPerLngDegree,
    y: (p.latitude - lat0) * KM_PER_DEGREE,
  }));
}

/** The point `northKm` north and `eastKm` east of `origin` (negative = south / west). */
export function offsetByKm(origin: LatLng, northKm: number, eastKm: number): LatLng {
  return {
    latitude: origin.latitude + northKm / KM_PER_DEGREE,
    longitude: origin.longitude + eastKm / (KM_PER_DEGREE * Math.cos(toRadians(origin.latitude))),
  };
}

/**
 * Speed in km/h from a GPS fix. Phones report speed in metres per second, and
 * report null or -1 when they have no reading (common when walking or indoors),
 * so fall back to distance ÷ time since the previous fix.
 */
export function speedKmhFromFix(
  reportedMetresPerSecond: number | null | undefined,
  previous: (LatLng & { timestamp: number }) | null,
  current: LatLng & { timestamp: number },
): number {
  if (reportedMetresPerSecond != null && reportedMetresPerSecond >= 0) {
    return reportedMetresPerSecond * 3.6;
  }
  if (!previous) return 0;
  const hours = (current.timestamp - previous.timestamp) / 3_600_000;
  if (hours <= 0) return 0;
  return distanceKm(previous, current) / hours;
}
