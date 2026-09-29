import type { ThreatLevel } from './constants/theme';

export type { ThreatLevel };

/** One time you saw a vehicle. Stored in SQLite (see src/db/database.ts). */
export interface Sighting {
  id: string;
  sessionId: string;
  /**
   * Normalised plate: uppercase letters and digits only, e.g. "KSJ449".
   * Empty ('') when you couldn't read it; the vehicle is then matched by its
   * colour, body type and make instead.
   */
  plate: string;
  /** When it was seen, in milliseconds since 1970 (Date.now()). */
  seenAt: number;
  /** Where YOU were when you saw it. null if GPS was not available. */
  latitude: number | null;
  longitude: number | null;
  zoneId: string | null;
  /** Anything distinctive, e.g. "roof rack, dented left door". */
  description?: string;
  colour?: string; // "Silver" — see src/constants/vehicles.ts
  bodyType?: string; // "Saloon"
  make?: string; // "Toyota"
  locationLabel?: string; // "High St / Mill Rd"
  source: 'manual' | 'demo' | 'camera';
  /**
   * Camera sightings only: the last time the plate was read in this zone during
   * this encounter. Manual and demo sightings are a single moment (seenAt).
   */
  lastSeenAt?: number;
  /** Set after an SDR ends with CLEAR — cleared sightings no longer count. */
  cleared?: boolean;
}

/** The threat engine's verdict on one vehicle. */
export interface ThreatAssessment {
  /** Groups this vehicle's sightings: the plate, or "~COLOUR|TYPE|MAKE" when no plate was read. */
  key: string;
  /** '' when the plate is unknown. */
  plate: string;
  /** "KSJ·449", or "Silver Toyota Saloon" when the plate is unknown. */
  label: string;
  /** true when the plate is unknown and the vehicle is matched by description (counts half). */
  described: boolean;
  /** The latest distinctive feature you noted, e.g. "roof rack". */
  description?: string;
  /** 0.0 – 10.0, one decimal place. */
  score: number;
  level: ThreatLevel;
  /** Sightings that counted towards the score. */
  sightings: number;
  /** Separate times it was seen. A camera counts a car that stays in view once. */
  encounters: number;
  zones: number;
  /** Minutes between the first and last counted sighting. */
  minutes: number;
  /** Distance between the two furthest-apart sightings. */
  spreadKm: number;
  /** true when the sightings line up along one road (see computeR2). */
  corridor: boolean;
  r2: number | null;
  points: number;
  /** Plain-English reasons, useful for a "why?" line in the UI. */
  reasons: string[];
}

export interface UserLocation {
  latitude: number;
  longitude: number;
  speedKmh: number;
  heading: number | null;
  accuracyM: number | null;
  timestamp: number;
}
