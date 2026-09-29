/**
 * Runs the real store and database code against Node's built-in SQLite. The
 * second phase is a separate process reopening the same file — an app restart —
 * to prove Day 20's "previously logged vehicles reappear".
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOUR_MS = 3_600_000;
const [phase = 'main', firstSessionId] = process.argv.slice(2);

function runPhase(name: string, dir: string, ...args: string[]): string {
  const result = spawnSync(process.execPath, [...process.execArgv, fileURLToPath(import.meta.url), name, ...args], {
    env: { ...process.env, SENTINEL_TEST_DB_DIR: dir },
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`${name} failed:\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout.trim();
}

async function phase1() {
  const { useSentinelStore, selectFlaggedCount, selectLoggedCount } = await import('../src/store/sentinelStore');
  const db = await import('../src/db/database');
  const store = useSentinelStore;

  await store.getState().restoreLastSession();
  const sessionId = store.getState().sessionId;
  assert.ok(sessionId, 'a first launch starts a session');
  assert.equal(store.getState().threatState, 'calm');

  const levels = [];
  for (let tap = 0; tap < 3; tap++) {
    await store.getState().logDemoSighting();
    levels.push(store.getState().threatState);
  }
  assert.deepEqual(levels, ['calm', 'watch', 'alert'], 'Day 9: three demo taps go calm → watch → alert');

  const here = { latitude: 6.45, longitude: 3.39, speedKmh: 30, heading: 90, accuracyM: 5, timestamp: Date.now() };
  store.getState().setUserLocation(here);
  const logged = await store.getState().logVehicle({ plate: 'abc-123', description: ' Dark grey saloon ' });
  assert.equal(logged?.plate, 'ABC123');
  assert.equal(await store.getState().logVehicle({ plate: ' ·- ' }), undefined, 'an empty plate is ignored');
  assert.equal(selectLoggedCount(store.getState()), 2);
  assert.equal(selectFlaggedCount(store.getState()), 1);

  const saved = await db.getSightings(sessionId);
  assert.equal(saved.length, 4);
  assert.equal(saved[3].description, 'Dark grey saloon');
  assert.equal(saved[3].latitude, 6.45);

  await store.getState().clearVehicle('KSJ 449');
  assert.equal(store.getState().threatState, 'calm', 'an SDR CLEAR calms the dashboard');
  await store.getState().whitelistVehicle('abc 123', 'Office driver');
  await store.getState().addKnownZone(6.45, 3.39, 'Home');
  assert.equal(await db.isDatabaseEncrypted(), false);

  // Phase 2 camera: many reads in one zone are one sighting; a new zone adds one.
  for (let i = 0; i < 5; i++) await store.getState().logCameraRead('CAM 777');
  store.getState().setUserLocation({ ...here, latitude: here.latitude + 0.01 }); // ~1.1 km north
  const camera = await store.getState().logCameraRead('cam-777');
  assert.equal(store.getState().sightings.filter((s) => s.plate === 'CAM777').length, 2);
  assert.equal(camera?.encounters, 1, 'a car still in view is one encounter');
  assert.equal((await db.getSightings(sessionId)).filter((s) => s.source === 'camera').length, 2);
  console.log(sessionId);
}

async function phase2() {
  const { useSentinelStore } = await import('../src/store/sentinelStore');
  const db = await import('../src/db/database');
  const store = useSentinelStore;

  // A sighting logged while start-up is still restoring must land in the restored session.
  const restoring = store.getState().restoreLastSession();
  const early = store.getState().logDemoSighting();
  await Promise.all([restoring, early]);

  const state = store.getState();
  assert.equal(state.sessionId, firstSessionId, 'the last session is resumed after a restart');
  assert.equal(state.sightings.length, 7);
  assert.equal(state.sightings.filter((s) => s.cleared).length, 3, 'SDR-cleared sightings stay cleared');
  assert.deepEqual(state.whitelist, ['ABC123']);
  assert.equal(state.knownZones.length, 1);
  assert.equal(state.threats.find((t) => t.plate === 'KSJ449')?.sightings, 1, 'only the new sighting counts');
  assert.equal(state.threats.find((t) => t.plate === 'CAM777')?.encounters, 1, 'camera sightings restore as one encounter');
  assert.equal(state.threatState, 'calm');

  await db.saveSighting({
    id: 'old',
    sessionId: firstSessionId,
    plate: 'OLD1',
    seenAt: Date.now() - 25 * HOUR_MS,
    latitude: null,
    longitude: null,
    zoneId: null,
    source: 'manual',
  });
  assert.equal(await db.deleteSightingsOlderThan(Date.now() - 24 * HOUR_MS), 1, 'Week 5 auto-delete');

  await store.getState().wipeAllData();
  const wiped = store.getState();
  assert.equal(wiped.sightings.length, 0);
  assert.deepEqual(wiped.whitelist, []);
  assert.notEqual(wiped.sessionId, firstSessionId);
  assert.equal((await db.getSightings(firstSessionId)).length, 0);
  assert.deepEqual(await db.getWhitelist(), []);
  assert.deepEqual(await db.getKnownZones(), []);
  assert.equal((await db.getLatestSession())?.id, wiped.sessionId, 'the app keeps working after a wipe');
  console.log('ok');
}

/** A phone that already has a version 1 database, from before camera sightings. */
async function upgrade() {
  const { DatabaseSync } = await import('node:sqlite');
  const v1 = new DatabaseSync(join(process.env.SENTINEL_TEST_DB_DIR as string, 'sentinel.db'));
  v1.exec(`
    CREATE TABLE sessions (id TEXT PRIMARY KEY NOT NULL, started_at INTEGER NOT NULL, ended_at INTEGER);
    CREATE TABLE sightings (
      id TEXT PRIMARY KEY NOT NULL,
      session_id TEXT NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
      plate TEXT NOT NULL, seen_at INTEGER NOT NULL, latitude REAL, longitude REAL, zone_id TEXT,
      description TEXT, colour TEXT, location_label TEXT,
      source TEXT NOT NULL DEFAULT 'manual', cleared INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE whitelist (plate TEXT PRIMARY KEY NOT NULL, label TEXT, added_at INTEGER NOT NULL);
    CREATE TABLE known_zones (zone_id TEXT PRIMARY KEY NOT NULL, label TEXT, added_at INTEGER NOT NULL);
    INSERT INTO sessions (id, started_at) VALUES ('old', 1000);
    INSERT INTO sightings (id, session_id, plate, seen_at) VALUES ('m1', 'old', 'ABC123', 2000);
    PRAGMA user_version = 1;
  `);
  v1.close();

  const db = await import('../src/db/database');
  const [kept] = await db.getSightings('old');
  assert.equal(kept.plate, 'ABC123', 'existing sightings survive the upgrade');
  assert.equal(kept.lastSeenAt, undefined);
  await db.saveSighting({ ...kept, id: 'c1', source: 'camera', seenAt: 3000, lastSeenAt: 9000 });
  const camera = (await db.getSightings('old')).find((s) => s.id === 'c1');
  assert.equal(camera?.lastSeenAt, 9000);
  assert.equal(camera?.source, 'camera');
  const version = await (await db.getDatabase()).getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  assert.equal(version?.user_version, 2);
  console.log('ok');
}

if (phase === 'phase1') {
  await phase1();
} else if (phase === 'phase2') {
  await phase2();
} else if (phase === 'upgrade') {
  await upgrade();
} else {
  const dirs = [mkdtempSync(join(tmpdir(), 'sentinel-db-')), mkdtempSync(join(tmpdir(), 'sentinel-db-'))];
  try {
    const sessionId = runPhase('phase1', dirs[0]);
    runPhase('phase2', dirs[0], sessionId);
    runPhase('upgrade', dirs[1]);
    console.log('✓ Store + database: demo taps, logging, camera reads, SDR clear, restart restore, auto-delete, panic wipe, schema upgrade');
  } finally {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  }
}
