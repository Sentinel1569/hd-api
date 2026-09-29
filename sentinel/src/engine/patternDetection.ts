/**
 * SENTINEL threat engine (Build Companion Day 8, plus the Week 6 filters).
 *
 * HOW THE SCORE WORKS
 * Each vehicle earns evidence points from its sightings in the last 2 hours:
 *   +1 point for every separate time you see it again (repeat encounters)
 *   +1 point for every extra zone (~500 m square) you have seen it in
 * Points become a 0–10 score on a curve: 6 points = 9.0, and the score keeps
 * approaching 10 without ever reaching it.
 *
 *   points:  0    1    2    3    4    5    6    8
 *   score:  0.0  3.2  5.4  6.8  7.8  8.5  9.0  9.5
 *
 * Filters that pull the score down:
 *   Same road (corridor): sightings lined up along one road mean the vehicle is
 *     probably just going your way. Zones stop counting and each repeat is worth 1/6.
 *   Rush hour: evidence ×0.75 when every sighting was in rush hour.
 *   Small spread: seen over less than 1.5 km → held at 6.9, just below ALERT.
 *   Known zones: repeat sightings inside one of your regular places count once.
 *   Plate unknown: a vehicle you could only describe (colour, type, make) earns
 *     half points, because many cars look alike. Link the plate when you read it.
 *   Whitelist: always 0.
 *
 * The Build Companion's Day 8 checks:
 *   4 sightings, 4 zones, 20 minutes  → 3 + 3 = 6 points      → 9.0
 *   3 sightings along the same road   → 2 × 1/6 = 0.33 points → 1.2
 *
 * CAMERA READS (Phase 2)
 * A rear camera reads a car in view several times a second, so the engine counts
 * encounters, not reads. Reads less than 90 s apart are one encounter, however
 * long it lasts. A car that stays behind you still earns a point for every new
 * zone, so following you through turns raises the score, while sitting behind
 * you on one straight road does not. A car that drops out of view and turns up
 * again later starts a new encounter. Manual logs are one encounter each, as before.
 *
 * Every number used here lives in THRESHOLDS (src/constants/theme.ts).
 */
import { THRESHOLDS, type ThreatLevel } from '../constants/theme';
import type { Sighting, ThreatAssessment } from '../types';
import { KM_PER_DEGREE, maxSpreadKm, toLocalKm, toRadians, type LatLng } from './geo';

export interface AssessOptions {
  /** Plates that must never raise an alert (Week 6). */
  whitelist?: Iterable<string>;
  /** Zone IDs of places you visit regularly — home, office (Week 6). */
  knownZones?: Iterable<string>;
}

/** "ksj 449", "KSJ-449" and "KSJ·449" all become "KSJ449", so they match. */
export function normalizePlate(plate: string): string {
  return plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** "KSJ449" → "KSJ·449", the way the designs display plates. */
export function formatPlate(plate: string): string {
  return normalizePlate(plate).replace(/([A-Z])(?=\d)|(\d)(?=[A-Z])/g, '$1$2·');
}

export interface VehicleLook {
  colour?: string;
  bodyType?: string;
  make?: string;
}

const upperWords = (value?: string) => (value ?? '').trim().replace(/\s+/g, ' ').toUpperCase();

/**
 * The matching key for a vehicle you could only describe: "~SILVER|SALOON|TOYOTA".
 * Needs at least a colour and a body type, otherwise null. The make is optional,
 * but a given make only matches the same make.
 */
export function describedKey(look: VehicleLook): string | null {
  const colour = upperWords(look.colour);
  const bodyType = upperWords(look.bodyType);
  if (!colour || !bodyType) return null;
  return `~${colour}|${bodyType}|${upperWords(look.make)}`;
}

/** What groups sightings into one vehicle: its plate, or its description when the plate is unknown. */
export function vehicleKey(s: Pick<Sighting, 'id' | 'plate'> & VehicleLook): string {
  return normalizePlate(s.plate) || describedKey(s) || `~UNIDENTIFIED:${s.id}`;
}

/** Turns a plate typed any way, or a described vehicle's key, into a vehicle key. */
export function toVehicleKey(plateOrKey: string): string {
  return plateOrKey.startsWith('~') ? plateOrKey : normalizePlate(plateOrKey);
}

/** "Silver Toyota Saloon": how a vehicle without a plate is shown and spoken. */
export function describedLabel(look: VehicleLook): string {
  return [look.colour, look.make, look.bodyType]
    .map((part) => (part ?? '').trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/**
 * The ID of the ~500 m square a point falls in, e.g. "z500:1435:760".
 * Two sightings in the same square share an ID.
 */
export function computeZoneId(
  latitude: number,
  longitude: number,
  zoneSizeM: number = THRESHOLDS.ZONE_SIZE_M,
): string {
  const latStep = zoneSizeM / 1000 / KM_PER_DEGREE;
  const row = Math.floor(latitude / latStep);
  // Lines of longitude bunch together away from the equator, so widen each
  // column (in degrees) to keep zones roughly square on the ground.
  const lngStep = latStep / Math.max(0.01, Math.cos(toRadians((row + 0.5) * latStep)));
  const col = Math.floor(longitude / lngStep);
  return `z${zoneSizeM}:${row}:${col}`;
}

/**
 * How well the points fit ONE straight line: 1 = perfectly in line (one road),
 * 0 = scattered evenly in every direction. It is the R² of a line fitted in any
 * direction, so it also works for roads running due north, where an ordinary
 * y-on-x R² breaks down. Returns null for fewer than 3 points, because any 2
 * points are trivially in line.
 */
export function computeR2(points: readonly LatLng[]): number | null {
  if (points.length < 3) return null;
  const xy = toLocalKm(points);
  const meanX = xy.reduce((sum, p) => sum + p.x, 0) / xy.length;
  const meanY = xy.reduce((sum, p) => sum + p.y, 0) / xy.length;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of xy) {
    const dx = p.x - meanX;
    const dy = p.y - meanY;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  const total = sxx + syy;
  if (total < 1e-9) return 0; // all in the same spot: no line at all
  return Math.sqrt((sxx - syy) ** 2 + 4 * sxy ** 2) / total;
}

/**
 * The corridor filter: true when the sightings line up along one road over at
 * least one zone's length, i.e. the vehicle is probably just going your way.
 */
export function isCorridor(points: readonly LatLng[]): boolean {
  const r2 = computeR2(points);
  return r2 !== null && r2 >= THRESHOLDS.CORRIDOR_R2 && maxSpreadKm(points) >= THRESHOLDS.ZONE_SIZE_M / 1000;
}

export function threatLevelForScore(score: number): ThreatLevel {
  if (score >= THRESHOLDS.ALERT) return 'alert';
  if (score >= THRESHOLDS.WATCH) return 'watch';
  return 'calm';
}

/** Evidence points → 0–10 score. 6 points = 9.0; never quite reaches 10. */
export function scoreFromPoints(points: number): number {
  return 10 * (1 - Math.pow(0.1, points / THRESHOLDS.POINTS_FOR_9));
}

const toMinutes = (hhmm: string) => {
  const [hours, minutes] = hhmm.split(':').map(Number);
  return hours * 60 + minutes;
};

/** Uses the phone's own clock and time zone. */
export function isRushHour(timestamp: number): boolean {
  const date = new Date(timestamp);
  const minuteOfDay = date.getHours() * 60 + date.getMinutes();
  return THRESHOLDS.RUSH_HOURS.some(({ from, to }) => minuteOfDay >= toMinutes(from) && minuteOfDay < toMinutes(to));
}

type LocatedSighting = Sighting & { latitude: number; longitude: number };

const hasLocation = (s: Sighting): s is LocatedSighting => s.latitude != null && s.longitude != null;

const zoneOf = (s: Sighting): string | null => (hasLocation(s) ? computeZoneId(s.latitude, s.longitude) : null);

const roundTo1 = (value: number) => Math.round(value * 10) / 10;

/** When a sighting ended: camera sightings last while the plate keeps being read. */
const endOf = (s: Sighting) => s.lastSeenAt ?? s.seenAt;

/**
 * How many separate times the vehicle was seen. Every manual or demo log is its
 * own encounter, because you logged it on purpose. A camera sighting, or a manual
 * log made while the camera still has the car in view, continues the current
 * encounter when it starts within ENCOUNTER_GAP_S of that encounter's last read.
 */
export function countEncounters(sightings: readonly Sighting[]): number {
  const gapMs = THRESHOLDS.ENCOUNTER_GAP_S * 1000;
  let encounters = 0;
  let end = -Infinity;
  let includesCamera = false;
  for (const s of [...sightings].sort((a, b) => a.seenAt - b.seenAt)) {
    const isCamera = s.source === 'camera';
    if ((isCamera || includesCamera) && s.seenAt - end <= gapMs) {
      end = Math.max(end, endOf(s));
      includesCamera ||= isCamera;
    } else {
      encounters++;
      end = endOf(s);
      includesCamera = isCamera;
    }
  }
  return encounters;
}

/** One plate read from the rear camera (Phase 2). */
export interface CameraRead {
  plate: string;
  seenAt: number;
  /** Your position when the plate was read. */
  latitude: number | null;
  longitude: number | null;
}

/**
 * Adds one rear-camera plate read to the list of sightings. While the plate keeps
 * being read (gaps under ENCOUNTER_GAP_S) in the same zone, the read only extends
 * that camera sighting's lastSeenAt. Entering a new zone, or reappearing after a
 * gap, starts a new sighting. The result is one stored sighting per zone per
 * encounter instead of thousands of rows.
 */
export function applyCameraRead(
  sightings: readonly Sighting[],
  read: CameraRead,
  sessionId: string,
  newId: () => string,
): { sightings: Sighting[]; sighting: Sighting; created: boolean } {
  const plate = normalizePlate(read.plate);
  const zoneId =
    read.latitude != null && read.longitude != null ? computeZoneId(read.latitude, read.longitude) : null;
  let latest: Sighting | null = null;
  for (const s of sightings) {
    if (s.plate === plate && (latest === null || s.seenAt >= latest.seenAt)) latest = s;
  }
  if (
    latest !== null &&
    latest.source === 'camera' &&
    !latest.cleared &&
    latest.zoneId === zoneId &&
    read.seenAt - endOf(latest) <= THRESHOLDS.ENCOUNTER_GAP_S * 1000
  ) {
    const extended: Sighting = { ...latest, lastSeenAt: Math.max(endOf(latest), read.seenAt) };
    return { sightings: sightings.map((s) => (s === latest ? extended : s)), sighting: extended, created: false };
  }
  const created: Sighting = {
    id: newId(),
    sessionId,
    plate,
    seenAt: read.seenAt,
    lastSeenAt: read.seenAt,
    latitude: read.latitude,
    longitude: read.longitude,
    zoneId,
    source: 'camera',
  };
  return { sightings: [...sightings, created], sighting: created, created: true };
}

/**
 * Vehicles you logged without a plate that could be the one you are now logging
 * with a plate: same colour and type, and the same make unless either make is
 * unknown. Newest first. Ask "Same car as the Silver Toyota Saloon you logged at
 * 14:05?" and, if the answer is yes, call the store's linkPlate.
 */
export function describedVehiclesLike(
  sightings: readonly Sighting[],
  look: VehicleLook,
): { key: string; label: string; lastSeenAt: number }[] {
  const colour = upperWords(look.colour);
  const bodyType = upperWords(look.bodyType);
  const make = upperWords(look.make);
  if (!colour || !bodyType) return [];
  const found = new Map<string, { key: string; label: string; lastSeenAt: number }>();
  for (const s of sightings) {
    if (normalizePlate(s.plate) || s.cleared) continue;
    const theirMake = upperWords(s.make);
    if (upperWords(s.colour) !== colour || upperWords(s.bodyType) !== bodyType) continue;
    if (make && theirMake && make !== theirMake) continue;
    const key = vehicleKey(s);
    const previous = found.get(key);
    if (!previous || endOf(s) > previous.lastSeenAt) {
      found.set(key, { key, label: describedLabel(s), lastSeenAt: endOf(s) });
    }
  }
  return [...found.values()].sort((a, b) => b.lastSeenAt - a.lastSeenAt);
}

/** Scores ONE vehicle from all of its sightings. */
export function assessVehicle(sightings: readonly Sighting[], options: AssessOptions = {}): ThreatAssessment {
  const bySeen = [...sightings].sort((a, b) => a.seenAt - b.seenAt);
  const newest = bySeen[bySeen.length - 1];
  const plate = newest ? normalizePlate(newest.plate) : '';
  const described = newest !== undefined && plate === '';
  const result: ThreatAssessment = {
    key: newest ? vehicleKey(newest) : '',
    plate,
    label: plate ? formatPlate(plate) : newest ? describedLabel(newest) : '',
    described,
    description: [...bySeen].reverse().find((s) => s.description)?.description,
    score: 0,
    level: 'calm',
    sightings: 0,
    encounters: 0,
    zones: 0,
    minutes: 0,
    spreadKm: 0,
    corridor: false,
    r2: null,
    points: 0,
    reasons: [],
  };

  const whitelist = new Set([...(options.whitelist ?? [])].map(normalizePlate));
  if (plate && whitelist.has(plate)) {
    result.reasons.push('Whitelisted — never alerts');
    return result;
  }

  // Only the recent pattern counts, and sightings cleared by an SDR never count.
  const active = bySeen.filter((s) => !s.cleared);
  if (active.length === 0) return result;
  const latest = Math.max(...active.map(endOf));
  const recent = active.filter((s) => latest - endOf(s) <= THRESHOLDS.PATTERN_WINDOW_MIN * 60_000);

  // Known zones: a neighbour's car seen ten times outside your house is one
  // sighting. The same car ALSO turning up elsewhere still adds zones.
  const knownZones = new Set(options.knownZones ?? []);
  const knownZonesSeen = new Set<string>();
  const counted = recent.filter((s) => {
    const zone = zoneOf(s);
    if (zone === null || !knownZones.has(zone)) return true;
    if (knownZonesSeen.has(zone)) return false;
    knownZonesSeen.add(zone);
    return true;
  });

  const located = counted.filter(hasLocation);
  const zones = new Set(located.map(zoneOf)).size;
  const spreadKm = maxSpreadKm(located);
  const r2 = computeR2(located);
  const corridor = isCorridor(located);

  const encounters = countEncounters(counted);
  const repeats = encounters - 1;
  const extraZones = Math.max(0, zones - 1);
  let points = corridor ? repeats * THRESHOLDS.CORRIDOR_POINT_WEIGHT : repeats + extraZones;
  if (described) points *= THRESHOLDS.DESCRIPTION_WEIGHT;

  // Demo sightings skip the rush-hour filter so the Day 9 test works at any time of day.
  const rushShare = counted.filter((s) => s.source !== 'demo' && isRushHour(s.seenAt)).length / counted.length;
  points *= 1 - (1 - THRESHOLDS.RUSH_HOUR_FACTOR) * rushShare;

  let score = roundTo1(scoreFromPoints(points));
  const heldBelowAlert = spreadKm < THRESHOLDS.MIN_SPREAD_KM && score >= THRESHOLDS.ALERT;
  if (heldBelowAlert) score = roundTo1(THRESHOLDS.ALERT - 0.1);

  const minutes = Math.round((Math.max(...counted.map(endOf)) - counted[0].seenAt) / 60_000);
  const reasons = [`Seen ${encounters}× in ${minutes} min`];
  if (zones > 1 && !corridor) reasons.push(`${zones} different zones`);
  if (corridor) reasons.push('Lined up along your road — counts much less');
  if (described) reasons.push('Plate unknown — matched by description, counts half');
  if (recent.length > counted.length) reasons.push('Repeat sightings in a known zone count once');
  if (rushShare > 0) reasons.push('Rush hour — score reduced');
  if (heldBelowAlert) reasons.push(`Seen over only ${spreadKm.toFixed(1)} km — held below ALERT`);
  if (located.length < counted.length) reasons.push(`${counted.length - located.length} sighting(s) had no GPS`);

  return {
    ...result,
    score,
    level: threatLevelForScore(score),
    sightings: counted.length,
    encounters,
    zones,
    minutes,
    spreadKm: roundTo1(spreadKm),
    corridor,
    r2: r2 === null ? null : Math.round(r2 * 1000) / 1000,
    points: Math.round(points * 100) / 100,
    reasons,
  };
}

/** Just the 0–10 number, for when you don't need the breakdown. */
export function calculateThreatScore(sightings: readonly Sighting[], options: AssessOptions = {}): number {
  return assessVehicle(sightings, options).score;
}

/** Scores every vehicle in a list of mixed sightings, highest score first. */
export function assessAllVehicles(sightings: readonly Sighting[], options: AssessOptions = {}): ThreatAssessment[] {
  const byVehicle = new Map<string, Sighting[]>();
  for (const s of sightings) {
    const key = vehicleKey(s);
    const list = byVehicle.get(key);
    if (list) list.push(s);
    else byVehicle.set(key, [s]);
  }
  return [...byVehicle.values()].map((list) => assessVehicle(list, options)).sort((a, b) => b.score - a.score);
}

/** The notification-strip line: "KSJ·449 · 3 SIGHTINGS · 34 MIN · 2.3KM SPREAD". */
export function describeThreat(a: ThreatAssessment): string {
  return `${a.label.toUpperCase()} · ${a.encounters} SIGHTINGS · ${a.minutes} MIN · ${a.spreadKm.toFixed(1)}KM SPREAD`;
}
