/**
 * App state (Day 6), wired to the threat engine (Day 9) and SQLite (Day 20).
 *
 * Install: npx expo install zustand
 *
 * Read state in any screen:
 *   const threatState = useSentinelStore((s) => s.threatState);
 *   const topThreat = useSentinelStore(selectTopThreat);
 * Call an action:
 *   const logDemoSighting = useSentinelStore((s) => s.logDemoSighting);
 *   <Pressable onPress={logDemoSighting}>…</Pressable>
 * Once at start-up, in App.tsx:
 *   useEffect(() => { useSentinelStore.getState().restoreLastSession(); }, []);
 */
import { create } from 'zustand';
import { THRESHOLDS, type ThreatLevel } from '../constants/theme';
import * as db from '../db/database';
import { DEMO_ORIGIN, DEMO_PLATE, demoPosition } from '../engine/demo';
import { applyCameraRead, assessAllVehicles, computeZoneId, normalizePlate } from '../engine/patternDetection';
import type { Sighting, ThreatAssessment, UserLocation } from '../types';

export interface LogVehicleInput {
  plate: string;
  description?: string;
  colour?: string;
  locationLabel?: string;
}

export interface SentinelState {
  sessionId: string | null;
  sightings: Sighting[];
  userLocation: UserLocation | null;
  /** The highest threat level across all vehicles — drives the whole dashboard. */
  threatState: ThreatLevel;
  /** Every logged vehicle, highest score first. */
  threats: ThreatAssessment[];
  whitelist: string[];
  knownZones: string[];

  restoreLastSession: () => Promise<void>;
  startSession: () => Promise<void>;
  /** "+ LOG VEHICLE MANUALLY" (Day 17). Uses your current GPS position. */
  logVehicle: (input: LogVehicleInput) => Promise<ThreatAssessment | undefined>;
  /** Day 9 test button: logs KSJ·449 at the next corner of a 1.2 km square. */
  logDemoSighting: () => Promise<ThreatAssessment | undefined>;
  /** Phase 2: call for every plate the rear camera's plate reader reports. */
  logCameraRead: (plate: string) => Promise<ThreatAssessment | undefined>;
  setUserLocation: (location: UserLocation) => void;
  /** Day 7 test buttons only. The next sighting recalculates the real state. */
  setThreatState: (level: ThreatLevel) => void;
  /** After an SDR ends with CLEAR. */
  clearVehicle: (plate: string) => Promise<void>;
  whitelistVehicle: (plate: string, label?: string) => Promise<void>;
  /** Marks the zone around a point as a regular place (home, office). */
  addKnownZone: (latitude: number, longitude: number, label?: string) => Promise<void>;
  /** Panic wipe (Week 5). */
  wipeAllData: () => Promise<void>;
}

const HOUR_MS = 3_600_000;

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

// Saving to the phone must never break the screen: log the problem and carry on.
const warn = (what: string) => (error: unknown) => console.warn(`[SENTINEL] ${what} failed`, error);

// Actions that log a sighting wait for the start-up restore, so a sighting
// logged in the first second can't land in a session that is then replaced.
let restoring: Promise<void> | null = null;

// A car in view is read several times a second. New camera sightings are saved
// at once; one that is only being extended is saved at most every 15 seconds.
const CAMERA_SAVE_EVERY_MS = 15_000;
const cameraSavedAt = new Map<string, number>();

export const useSentinelStore = create<SentinelState>()((set, get) => {
  /** Applies changes and re-scores every vehicle. */
  const update = (changes: Partial<Pick<SentinelState, 'sightings' | 'whitelist' | 'knownZones'>>) => {
    const next = { ...get(), ...changes };
    const threats = assessAllVehicles(next.sightings, { whitelist: next.whitelist, knownZones: next.knownZones });
    set({ ...changes, threats, threatState: threats[0]?.level ?? 'calm' });
  };

  const ensureSession = async () => {
    if (restoring) await restoring;
    if (!get().sessionId) await get().startSession();
    return get().sessionId as string;
  };

  const addSighting = async (sighting: Omit<Sighting, 'id' | 'sessionId'>) => {
    const saved: Sighting = { ...sighting, id: newId(), sessionId: await ensureSession() };
    update({ sightings: [...get().sightings, saved] });
    await db.saveSighting(saved).catch(warn('Saving a sighting'));
    return get().threats.find((t) => t.plate === saved.plate);
  };

  return {
    sessionId: null,
    sightings: [],
    userLocation: null,
    threatState: 'calm',
    threats: [],
    whitelist: [],
    knownZones: [],

    restoreLastSession: () =>
      (restoring ??= (async () => {
        let resumed = false;
        try {
          const now = Date.now();
          const maxAgeMs = THRESHOLDS.AUTO_DELETE_HOURS * HOUR_MS;
          await db.deleteSightingsOlderThan(now - maxAgeMs);
          const [latest, whitelist, knownZones] = await Promise.all([
            db.getLatestSession(),
            db.getWhitelist(),
            db.getKnownZones(),
          ]);
          if (latest && latest.endedAt === null && now - latest.startedAt < maxAgeMs) {
            const sightings = await db.getSightings(latest.id);
            set({ sessionId: latest.id });
            update({ sightings, whitelist, knownZones });
            resumed = true;
          } else {
            update({ whitelist, knownZones });
          }
        } catch (error) {
          warn('Restoring the last session')(error);
        }
        if (!resumed) await get().startSession();
      })()),

    startSession: async () => {
      const previous = get().sessionId;
      const id = newId();
      const startedAt = Date.now();
      set({ sessionId: id });
      update({ sightings: [] });
      cameraSavedAt.clear();
      if (previous) await db.endSession(previous, startedAt).catch(warn('Ending the last session'));
      await db.createSession(id, startedAt).catch(warn('Starting a session'));
    },

    logVehicle: async ({ plate, description, colour, locationLabel }) => {
      const normalised = normalizePlate(plate);
      if (!normalised) return undefined;
      const here = get().userLocation;
      return addSighting({
        plate: normalised,
        seenAt: Date.now(),
        latitude: here?.latitude ?? null,
        longitude: here?.longitude ?? null,
        zoneId: here ? computeZoneId(here.latitude, here.longitude) : null,
        description: description?.trim() || undefined,
        colour: colour?.trim() || undefined,
        locationLabel: locationLabel?.trim() || undefined,
        source: 'manual',
      });
    },

    logDemoSighting: async () => {
      const demoCount = get().sightings.filter((s) => s.source === 'demo').length;
      const at = demoPosition(demoCount, get().userLocation ?? DEMO_ORIGIN);
      return addSighting({
        plate: DEMO_PLATE,
        seenAt: Date.now(),
        latitude: at.latitude,
        longitude: at.longitude,
        zoneId: computeZoneId(at.latitude, at.longitude),
        description: 'Demo vehicle',
        source: 'demo',
      });
    },

    logCameraRead: async (plate) => {
      const normalised = normalizePlate(plate);
      if (!normalised) return undefined;
      const sessionId = await ensureSession();
      const here = get().userLocation;
      const result = applyCameraRead(
        get().sightings,
        { plate: normalised, seenAt: Date.now(), latitude: here?.latitude ?? null, longitude: here?.longitude ?? null },
        sessionId,
        newId,
      );
      update({ sightings: result.sightings });
      const { sighting } = result;
      const readAt = sighting.lastSeenAt ?? sighting.seenAt;
      if (result.created || readAt - (cameraSavedAt.get(sighting.id) ?? 0) >= CAMERA_SAVE_EVERY_MS) {
        cameraSavedAt.set(sighting.id, readAt);
        await db.saveSighting(sighting).catch(warn('Saving a camera sighting'));
      }
      return get().threats.find((t) => t.plate === normalised);
    },

    setUserLocation: (location) => set({ userLocation: location }),

    setThreatState: (level) => set({ threatState: level }),

    clearVehicle: async (plate) => {
      const normalised = normalizePlate(plate);
      update({ sightings: get().sightings.map((s) => (s.plate === normalised ? { ...s, cleared: true } : s)) });
      const sessionId = get().sessionId;
      if (sessionId) await db.markVehicleCleared(sessionId, normalised).catch(warn('Clearing a vehicle'));
    },

    whitelistVehicle: async (plate, label) => {
      const normalised = normalizePlate(plate);
      if (!normalised || get().whitelist.includes(normalised)) return;
      update({ whitelist: [...get().whitelist, normalised] });
      await db.addToWhitelist(normalised, label).catch(warn('Whitelisting a vehicle'));
    },

    addKnownZone: async (latitude, longitude, label) => {
      const zoneId = computeZoneId(latitude, longitude);
      if (get().knownZones.includes(zoneId)) return;
      update({ knownZones: [...get().knownZones, zoneId] });
      await db.addKnownZone(zoneId, label).catch(warn('Saving a known zone'));
    },

    wipeAllData: async () => {
      await db.wipeDatabase().catch(warn('Wiping the database'));
      restoring = null;
      set({ sessionId: null, userLocation: null });
      update({ sightings: [], whitelist: [], knownZones: [] });
      await get().startSession();
    },
  };
});

/** Dashboard stats row: LOGGED = vehicles logged, FLAGGED = vehicles at ALERT. */
export const selectLoggedCount = (s: SentinelState) => s.threats.length;
export const selectFlaggedCount = (s: SentinelState) => s.threats.filter((t) => t.level === 'alert').length;
/** The vehicle the notification strip and SDR screens are about. */
export const selectTopThreat = (s: SentinelState): ThreatAssessment | null => s.threats[0] ?? null;
