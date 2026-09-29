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

  store.getState().setUserLocation({
    latitude: 6.45,
    longitude: 3.39,
    speedKmh: 30,
    heading: 90,
    accuracyM: 5,
    timestamp: Date.now(),
  });
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
  assert.equal(state.sightings.length, 5);
  assert.equal(state.sightings.filter((s) => s.cleared).length, 3, 'SDR-cleared sightings stay cleared');
  assert.deepEqual(state.whitelist, ['ABC123']);
  assert.equal(state.knownZones.length, 1);
  assert.equal(state.threats.find((t) => t.plate === 'KSJ449')?.sightings, 1, 'only the new sighting counts');
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

if (phase === 'phase1') {
  await phase1();
} else if (phase === 'phase2') {
  await phase2();
} else {
  const dir = mkdtempSync(join(tmpdir(), 'sentinel-db-'));
  try {
    const sessionId = runPhase('phase1', dir);
    runPhase('phase2', dir, sessionId);
    console.log('✓ Store + database: demo taps, logging, SDR clear, restart restore, auto-delete, panic wipe');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
