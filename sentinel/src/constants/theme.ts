/**
 * SENTINEL design tokens and threat thresholds (Build Companion, Day 1).
 *
 * Every colour, font and tuning number lives in this one file, so you can
 * adjust the look or the sensitivity of the app without touching other code.
 */

export type ThreatLevel = 'calm' | 'watch' | 'alert';
export type ThemeName = 'dark' | 'light';

// ---------------------------------------------------------------------------
// COLOURS — straight from the design-system prompt (Build Companion §1.1).
// State accents are identical in both themes.
// ---------------------------------------------------------------------------
const DARK = {
  background: '#040A0F',
  surface: '#071018',
  border: '#0E2030',
  mapBackground: '#030B10',
  mapRoad: '#0A1820',
  mapGrid: 'rgba(0,136,187,0.06)',
  textPrimary: '#FFFFFF',
  textSecondary: 'rgba(255,255,255,0.65)',
  textMuted: 'rgba(255,255,255,0.35)',
  cyan: '#0088BB', // calm / default
  amber: '#CC7A00', // watch
  red: '#DD2222', // alert — ONLY when a threat is confirmed
  green: '#00AA55', // safe / clear
};

export type Palette = typeof DARK;

const LIGHT: Palette = {
  ...DARK,
  background: '#F0F4F8',
  surface: '#FFFFFF',
  border: '#CBD5E0',
  // The design prompt does not define these three for light mode — adjust freely.
  mapBackground: '#E6EDF3',
  mapRoad: '#CBD5E0',
  mapGrid: 'rgba(0,136,187,0.10)',
  textPrimary: '#0D0D0D',
  textSecondary: '#4A5568',
  textMuted: 'rgba(13,13,13,0.45)',
};

export const COLOURS: Record<ThemeName, Palette> = { dark: DARK, light: LIGHT };

// ---------------------------------------------------------------------------
// FONTS — install with:
//   npx expo install expo-font @expo-google-fonts/rajdhani @expo-google-fonts/share-tech-mono
// then load them once in App.tsx with useFonts({ Rajdhani_500Medium, Rajdhani_700Bold,
// ShareTechMono_400Regular }). Without this step every screen falls back to the
// system font.
// ---------------------------------------------------------------------------
export const FONTS = {
  heading: 'Rajdhani_700Bold', // headings and HUD numbers
  body: 'Rajdhani_500Medium',
  mono: 'ShareTechMono_400Regular', // plates, labels, timestamps
};

export const SIZES = {
  minActionFont: 20, // smallest font on anything the driver taps
  primaryButton: 64,
  secondaryButton: 56,
  ghostButton: 48,
  radiusCard: 8,
  radiusButton: 6,
  radiusBadge: 4,
};

// ---------------------------------------------------------------------------
// STATE UI — the text and colours the dashboard switches between (Day 7).
// The Build Companion only defines the calm and alert versions; watch is new.
// ---------------------------------------------------------------------------
export const STATE_UI: Record<
  ThreatLevel,
  { accent: string; tint: string; edge: string; pill: string; title: (plate?: string) => string; button: string }
> = {
  calm: {
    accent: DARK.cyan,
    tint: 'rgba(0,136,187,0.08)',
    edge: 'rgba(0,136,187,0.3)',
    pill: '● MONITORING',
    title: () => 'All Clear — System Active',
    button: '⊕  SYSTEM ACTIVE',
  },
  watch: {
    accent: DARK.amber,
    tint: 'rgba(204,122,0,0.10)',
    edge: 'rgba(204,122,0,0.45)',
    pill: '◉ WATCH',
    title: (plate) => `Watching — ${plate ?? 'vehicle'}`,
    button: '▶  RUN SDR CHECK',
  },
  alert: {
    accent: DARK.red,
    tint: 'rgba(221,34,34,0.12)',
    edge: 'rgba(221,34,34,0.6)',
    pill: '⚠ ALERT',
    title: (plate) => `Vehicle Following — ${plate ?? 'unknown'}`,
    button: '▶  BEGIN SDR PROTOCOL',
  },
};

// ---------------------------------------------------------------------------
// THRESHOLDS — every number the threat engine and SDR use.
// ---------------------------------------------------------------------------
export const THRESHOLDS = {
  // Dashboard state from the 0–10 threat score (Day 9).
  WATCH: 4.0,
  ALERT: 7.0,

  // Pattern engine (Day 8). See src/engine/patternDetection.ts for how they combine.
  ZONE_SIZE_M: 500, // the map is cut into ~500 m squares called zones
  POINTS_FOR_9: 6, // 6 evidence points = threat score 9.0
  PATTERN_WINDOW_MIN: 120, // sightings older than this (before the latest one) are ignored
  ENCOUNTER_GAP_S: 90, // camera reads of a plate less than this far apart = one continuous encounter
  DESCRIPTION_WEIGHT: 0.5, // plate unknown: points ×0.5, because many cars look alike
  CORRIDOR_R2: 0.9, // sightings this close to one straight line = just sharing a road
  CORRIDOR_POINT_WEIGHT: 1 / 6, // on a shared road a repeat sighting is worth 1/6 of a point

  // False-positive filters (Week 6).
  MIN_SPREAD_KM: 1.5, // seen over less than this distance → held below ALERT
  RUSH_HOUR_FACTOR: 0.75, // evidence ×0.75 when every sighting was in rush hour
  RUSH_HOURS: [
    { from: '06:30', to: '09:30' },
    { from: '16:00', to: '19:30' },
  ],

  // SDR scoring and verdicts (Days 13–14).
  SDR_ANSWER_FACTOR: 2.5, // YES multiplies the odds by 2.5, NO divides them by 2.5
  SDR_CONFIRMED_SCORE: 8.5, // CONFIRMED needs a final score of at least this…
  SDR_CONFIRMED_MIN_YES: 2, // …and the vehicle reappearing after at least 2 maneuvers
  SDR_CLEAR_SCORE: 3.0, // CLEAR needs a final score below this…
  SDR_CLEAR_MAX_YES: 1, // …and at most 1 reappearance

  // Data retention (Week 5).
  AUTO_DELETE_HOURS: 24,
};
