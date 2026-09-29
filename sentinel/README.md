# SENTINEL — missing parts kit

Code for the parts the Build Companion names but never specifies. Read it with
`docs/SENTINEL_Missing_Parts.docx`, which explains every gap, why each part works
the way it does, and how SENTINEL moves from the phone into the car.

## What's here

| File | Build day | What it gives you |
|---|---|---|
| `src/constants/theme.ts` | 1, 7 | `COLOURS` (dark + light), `FONTS`, `THRESHOLDS`, and `STATE_UI` for calm / watch / alert |
| `src/store/sentinelStore.ts` | 6, 9, 20 | Zustand store: threat state, sightings, test button, saving to SQLite, and `logCameraRead` for a Phase 2 rear camera |
| `src/engine/patternDetection.ts` | 8, Week 6 | `calculateThreatScore`, `computeZoneId`, `computeR2`, corridor filter, whitelist, rush hour, 1.5 km rule, known zones, and encounter counting for camera reads |
| `src/engine/demo.ts` | 9 | Where the test button places each sighting |
| `src/hooks/useLocationTracking.ts` | 10 | GPS position and speed |
| `src/engine/sdr.ts` | 11–14 | The 5 SDR rules, 5 maneuvers, voice lines, scoring, verdicts, result-screen buttons |
| `src/security/appLock.ts` | 19 | PIN, fingerprint/face unlock, app-switcher privacy screen |
| `src/db/database.ts` | 20, Week 5 | SQLite tables, sessions, auto-delete, SQLCipher switch, panic wipe |
| `src/services/emergency.ts` | Result screen | SMS / WhatsApp alert with your location, police-station search |
| `src/engine/geo.ts`, `src/types.ts` | — | Distance helpers and shared types |
| `scripts/check-engine.ts` | 8 | Prints ✓ or ✗ for every numbered check in the plan |

## Put it in your project

1. Your project needs an `App.tsx`. `npx create-expo-app@latest Sentinel2 --template blank-typescript`
   makes one; the default template makes an `app/` folder instead.
2. Copy `src/` and `scripts/` into `C:\Users\User1\Sentinel2\`. Don't copy
   `package.json` or `tests/` — they only run the checks in this folder.
3. Install the packages the kit uses:

   ```
   npx expo install zustand expo-sqlite expo-location expo-secure-store expo-crypto expo-local-authentication expo-screen-capture expo-sms expo-speech expo-font @expo-google-fonts/rajdhani @expo-google-fonts/share-tech-mono
   ```

4. Day 8 check: `npx tsx scripts/check-engine.ts`
5. When you ask Copilot to build a screen, tell it to use these files and not
   rewrite them, e.g. *"Use useSentinelStore from src/store/sentinelStore.ts and
   STATE_UI from src/constants/theme.ts. Don't change files in src/engine."*

Every tuning number (thresholds, zone size, rush hours, SDR factors) is in
`THRESHOLDS` in `src/constants/theme.ts`.

## Checks

```
npm install
npm test
```

Runs the engine checks (including simulated rear-camera drives), the store and
database against real SQLite (including an app restart and a database upgrade),
and the PIN lockout. The kit was also type-checked in
strict mode and bundled for Android inside a fresh Expo SDK 57 project.
