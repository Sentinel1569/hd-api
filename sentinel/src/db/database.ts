/**
 * Local SQLite storage (Day 20), with the Week 5 encryption and auto-delete.
 *
 * Install: npx expo install expo-sqlite expo-secure-store expo-crypto
 *
 * ENCRYPTION (Week 5) does NOT work in Expo Go:
 *   1. app.json → "plugins": [["expo-sqlite", { "useSQLCipher": true }]]
 *   2. Make a development build (npx expo run:android, or eas build --profile development).
 *   3. Set ENCRYPT_DATABASE below to true. The app then uses a fresh file,
 *      sentinel-secure.db, because an existing plain database can't be opened with a key.
 *   4. Check isDatabaseEncrypted() returns true. Without SQLCipher the key is
 *      silently ignored and the data is NOT encrypted.
 */
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';
import type { Sighting } from '../types';

export const ENCRYPT_DATABASE = false;

const DATABASE_NAME = ENCRYPT_DATABASE ? 'sentinel-secure.db' : 'sentinel.db';
const KEY_NAME = 'sentinel.db.key';

// To change tables later: add SCHEMA_V3, bump SCHEMA_VERSION, and add an
// `if (version < 3)` step in openDatabase(). Never edit a schema once shipped.
const SCHEMA_VERSION = 2;
const SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at   INTEGER
);

CREATE TABLE IF NOT EXISTS sightings (
  id             TEXT PRIMARY KEY NOT NULL,
  session_id     TEXT NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
  plate          TEXT NOT NULL,
  seen_at        INTEGER NOT NULL,
  latitude       REAL,
  longitude      REAL,
  zone_id        TEXT,
  description    TEXT,
  colour         TEXT,
  location_label TEXT,
  source         TEXT NOT NULL DEFAULT 'manual',
  cleared        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sightings_session ON sightings (session_id, seen_at);
CREATE INDEX IF NOT EXISTS idx_sightings_seen_at ON sightings (seen_at);

CREATE TABLE IF NOT EXISTS whitelist (
  plate    TEXT PRIMARY KEY NOT NULL,
  label    TEXT,
  added_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS known_zones (
  zone_id  TEXT PRIMARY KEY NOT NULL,
  label    TEXT,
  added_at INTEGER NOT NULL
);
`;

// Version 2: camera sightings remember when the plate was last read (Phase 2).
const SCHEMA_V2 = 'ALTER TABLE sightings ADD COLUMN last_seen_at INTEGER;';

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

/** Opens the database, creating the tables the first time. Safe to call often. */
export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = openDatabase().catch((error) => {
      databasePromise = null; // let the next call try again
      throw error;
    });
  }
  return databasePromise;
}

async function openDatabase(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
  if (ENCRYPT_DATABASE) {
    // Must be the very first statement on a SQLCipher connection.
    await db.execAsync(`PRAGMA key = "x'${await getOrCreateKey()}'"`);
  }
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const version = row?.user_version ?? 0;
  if (version < 1) await db.execAsync(SCHEMA_V1);
  if (version < 2) await db.execAsync(SCHEMA_V2);
  if (version < SCHEMA_VERSION) await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  return db;
}

async function getOrCreateKey(): Promise<string> {
  const existing = await SecureStore.getItemAsync(KEY_NAME);
  if (existing) return existing;
  const bytes = await Crypto.getRandomBytesAsync(32);
  const key = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  await SecureStore.setItemAsync(KEY_NAME, key);
  return key;
}

/** true only when SQLCipher is really running (always false in Expo Go). */
export async function isDatabaseEncrypted(): Promise<boolean> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ cipher_version: string }>('PRAGMA cipher_version');
  return ENCRYPT_DATABASE && Boolean(row?.cipher_version);
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------
export interface SessionRecord {
  id: string;
  startedAt: number;
  endedAt: number | null;
}

export async function createSession(id: string, startedAt: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('INSERT OR IGNORE INTO sessions (id, started_at) VALUES (?, ?)', id, startedAt);
}

export async function endSession(id: string, endedAt: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE sessions SET ended_at = ? WHERE id = ?', endedAt, id);
}

export async function getLatestSession(): Promise<SessionRecord | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ id: string; started_at: number; ended_at: number | null }>(
    'SELECT id, started_at, ended_at FROM sessions ORDER BY started_at DESC LIMIT 1',
  );
  return row ? { id: row.id, startedAt: row.started_at, endedAt: row.ended_at } : null;
}

// ---------------------------------------------------------------------------
// Sightings
// ---------------------------------------------------------------------------
interface SightingRow {
  id: string;
  session_id: string;
  plate: string;
  seen_at: number;
  last_seen_at: number | null;
  latitude: number | null;
  longitude: number | null;
  zone_id: string | null;
  description: string | null;
  colour: string | null;
  location_label: string | null;
  source: string;
  cleared: number;
}

const toSighting = (row: SightingRow): Sighting => ({
  id: row.id,
  sessionId: row.session_id,
  plate: row.plate,
  seenAt: row.seen_at,
  lastSeenAt: row.last_seen_at ?? undefined,
  latitude: row.latitude,
  longitude: row.longitude,
  zoneId: row.zone_id,
  description: row.description ?? undefined,
  colour: row.colour ?? undefined,
  locationLabel: row.location_label ?? undefined,
  source: row.source === 'demo' || row.source === 'camera' ? row.source : 'manual',
  cleared: row.cleared === 1,
});

export async function saveSighting(s: Sighting): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO sightings
       (id, session_id, plate, seen_at, last_seen_at, latitude, longitude, zone_id, description, colour, location_label, source, cleared)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    s.id,
    s.sessionId,
    s.plate,
    s.seenAt,
    s.lastSeenAt ?? null,
    s.latitude,
    s.longitude,
    s.zoneId,
    s.description ?? null,
    s.colour ?? null,
    s.locationLabel ?? null,
    s.source,
    s.cleared ? 1 : 0,
  );
}

export async function getSightings(sessionId: string): Promise<Sighting[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<SightingRow>(
    'SELECT * FROM sightings WHERE session_id = ? ORDER BY seen_at',
    sessionId,
  );
  return rows.map(toSighting);
}

/** After an SDR ends with CLEAR, the vehicle's sightings so far stop counting. */
export async function markVehicleCleared(sessionId: string, plate: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE sightings SET cleared = 1 WHERE session_id = ? AND plate = ?', sessionId, plate);
}

/** Week 5 auto-delete. Returns how many sightings were removed. */
export async function deleteSightingsOlderThan(cutoff: number): Promise<number> {
  const db = await getDatabase();
  const result = await db.runAsync('DELETE FROM sightings WHERE seen_at < ?', cutoff);
  await db.runAsync(
    'DELETE FROM sessions WHERE started_at < ? AND id NOT IN (SELECT session_id FROM sightings)',
    cutoff,
  );
  return result.changes;
}

// ---------------------------------------------------------------------------
// Whitelist and known zones (Week 6)
// ---------------------------------------------------------------------------
export async function getWhitelist(): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ plate: string }>('SELECT plate FROM whitelist ORDER BY added_at');
  return rows.map((r) => r.plate);
}

export async function addToWhitelist(plate: string, label?: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'INSERT OR REPLACE INTO whitelist (plate, label, added_at) VALUES (?, ?, ?)',
    plate,
    label ?? null,
    Date.now(),
  );
}

export async function removeFromWhitelist(plate: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM whitelist WHERE plate = ?', plate);
}

export async function getKnownZones(): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ zone_id: string }>('SELECT zone_id FROM known_zones ORDER BY added_at');
  return rows.map((r) => r.zone_id);
}

export async function addKnownZone(zoneId: string, label?: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'INSERT OR REPLACE INTO known_zones (zone_id, label, added_at) VALUES (?, ?, ?)',
    zoneId,
    label ?? null,
    Date.now(),
  );
}

export async function removeKnownZone(zoneId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM known_zones WHERE zone_id = ?', zoneId);
}

// ---------------------------------------------------------------------------
// Panic wipe (Week 5)
// ---------------------------------------------------------------------------
/**
 * Erases every row, overwrites the freed space and empties the -wal file
 * (Android's deleteDatabaseAsync removes only the main file, never the -wal).
 * With encryption on, the key is destroyed as well, so leftover bytes can never
 * be decrypted; the file goes with it because it can't be reopened without the
 * old key. The next getDatabase() call starts a fresh, empty database.
 */
export async function wipeDatabase(): Promise<void> {
  const db = await getDatabase();
  await db.execAsync(`
    PRAGMA secure_delete = ON;
    DELETE FROM sightings;
    DELETE FROM sessions;
    DELETE FROM whitelist;
    DELETE FROM known_zones;
    VACUUM;
    PRAGMA wal_checkpoint(TRUNCATE);
  `);
  if (ENCRYPT_DATABASE) {
    await db.closeAsync();
    databasePromise = null;
    await SQLite.deleteDatabaseAsync(DATABASE_NAME);
    await SecureStore.deleteItemAsync(KEY_NAME);
  }
}
