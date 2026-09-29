/**
 * SDR (surveillance detection route) protocol: rules, maneuvers, scoring and
 * verdicts for the SDR Brief, Active and Result screens (Days 11–14).
 *
 * SCORING
 * The threat score is treated as a probability (7.0 = 70%). After each maneuver,
 * YES ("still visible") multiplies the odds by 2.5 and NO divides them by 2.5.
 * Working on the odds keeps the score between 0 and 10 without capping, and the
 * result depends only on how many YES and NO answers there were, not their order.
 *
 * Starting from 7.8, five answers end at:
 *   5 YES → 9.9   4 YES → 9.8   3 YES → 9.0   2 YES → 5.9   1 YES → 1.8   0 YES → 0.4
 * Scores are held between 0.1 and 9.9 — the app never claims certainty.
 */
import { COLOURS, THRESHOLDS } from '../constants/theme';
import { formatPlate, normalizePlate } from './patternDetection';

export type DrivingSide = 'right' | 'left';
export type SdrVerdict = 'confirmed' | 'inconclusive' | 'clear';

export interface SdrManeuver {
  id: string;
  name: string;
  glyph: string;
  /** Shown on screen. */
  instruction: string;
  /** Read aloud with expo-speech. */
  voice: string;
}

/** The 5 rules shown on the SDR Brief screen before CONFIRM (Day 11). */
export const SDR_RULES = [
  'Drive legally at all times — no speeding, no red lights, no illegal turns. A crash makes you more vulnerable, not less.',
  'Stay on busy, well-lit public roads. Never lead a suspected tail to your home, a quiet street or a dead end.',
  'Act normally. Use your mirrors as usual — never stare, gesture, brake-check, confront or chase the other vehicle.',
  'Answer YES only when you can clearly see the same vehicle. If you cannot see it, answer NO.',
  'Your safety comes first. If you feel threatened, tap ABORT, drive to a police station or busy public place, and call for help (112 in Nigeria).',
];

/**
 * The 5 maneuvers, in order. Every one is legal and keeps you in public.
 * Pass 'left' in countries that drive on the left (Kenya, South Africa, UK) so
 * the box turn uses the easy turns there.
 */
export function getSdrManeuvers(drivingSide: DrivingSide = 'right'): SdrManeuver[] {
  const turn = drivingSide === 'right' ? 'right' : 'left';
  return [
    {
      id: 'box-turn',
      name: 'BOX TURN',
      glyph: '🔄',
      instruction: `Make 4 consecutive ${turn} turns around a block. You return to the same road. No innocent driver does this — a tail must follow or break cover.`,
      voice: `Box turn. When it is safe, take the next four ${turn} turns to come back onto this road.`,
    },
    {
      id: 'speed-check',
      name: 'SPEED CHECK',
      glyph: '🐢',
      instruction:
        'Move to the slow lane and ease off to about 10 km/h below the traffic for 1 km. Normal drivers overtake you. A tail hangs back to keep you in sight.',
      voice: 'Speed check. Move to the slow lane, ease off, and let traffic overtake you for one kilometre.',
    },
    {
      id: 'roundabout-loop',
      name: 'ROUNDABOUT LOOP',
      glyph: '⭕',
      instruction:
        'At the next roundabout, go all the way round and leave the way you came. No roundabout? Turn around where it is legal and safe. A tail must turn back too, or lose you.',
      voice: 'Roundabout loop. At the next roundabout, go all the way round and head back the way you came.',
    },
    {
      id: 'safe-stop',
      name: 'SAFE STOP',
      glyph: '🅿️',
      instruction:
        'Pull into a busy, well-lit public place — a fuel station or a guarded car park. Stay in the car, doors locked, for 2 minutes. Innocent traffic drives past. A tail waits nearby or circles back.',
      voice: 'Safe stop. Pull into a busy fuel station or guarded car park. Stay in the car with the doors locked for two minutes.',
    },
    {
      id: 'exit-rejoin',
      name: 'EXIT AND REJOIN',
      glyph: '↪️',
      instruction:
        'Leave the main road at the next exit or side street, then rejoin it heading the same way. Only a vehicle following you makes the same detour.',
      voice: 'Exit and rejoin. Take the next exit, then come back onto this road in the same direction.',
    },
  ];
}

/** "K S J, 4 4 9" — text-to-speech mangles plates read as one word. */
export function spellPlate(plate: string): string {
  return formatPlate(plate)
    .split('·')
    .map((part) => part.split('').join(' '))
    .join(', ');
}

/** Spoken when a maneuver starts: "Maneuver 1 of 5. Box turn. …" */
export function maneuverVoiceLine(maneuver: SdrManeuver, index: number, total: number): string {
  return `Maneuver ${index + 1} of ${total}. ${maneuver.voice}`;
}

/** On-screen question after each maneuver: "IS KSJ · 449 STILL VISIBLE?" */
export function recheckQuestion(plate: string): string {
  return `IS ${formatPlate(plate).split('·').join(' · ')} STILL VISIBLE?`;
}

export function recheckVoiceLine(plate: string): string {
  return `Is ${spellPlate(plate)} still visible?`;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const roundTo1 = (value: number) => Math.round(value * 10) / 10;

/** Threat score after the given YES (true) / NO (false) answers. */
export function scoreAfterAnswers(startScore: number, answers: readonly boolean[]): number {
  const probability = clamp(startScore / 10, 0.01, 0.99);
  const yes = answers.filter(Boolean).length;
  const net = yes - (answers.length - yes);
  const odds = (probability / (1 - probability)) * THRESHOLDS.SDR_ANSWER_FACTOR ** net;
  return clamp(roundTo1((10 * odds) / (1 + odds)), 0.1, 9.9);
}

export function sdrVerdict(finalScore: number, answers: readonly boolean[]): SdrVerdict {
  const yes = answers.filter(Boolean).length;
  if (finalScore >= THRESHOLDS.SDR_CONFIRMED_SCORE && yes >= THRESHOLDS.SDR_CONFIRMED_MIN_YES) return 'confirmed';
  if (finalScore < THRESHOLDS.SDR_CLEAR_SCORE && yes <= THRESHOLDS.SDR_CLEAR_MAX_YES) return 'clear';
  return 'inconclusive';
}

export interface SdrStepResult {
  maneuver: SdrManeuver;
  seen: boolean;
  scoreAfter: number;
  /** For the Result screen's breakdown card. */
  label: string;
}

export interface SdrSummary {
  plate: string;
  startScore: number;
  finalScore: number;
  verdict: SdrVerdict;
  steps: SdrStepResult[];
}

/** Everything the SDR Result screen shows (Day 14). */
export function summariseSdr(
  plate: string,
  startScore: number,
  answers: readonly boolean[],
  drivingSide: DrivingSide = 'right',
): SdrSummary {
  const maneuvers = getSdrManeuvers(drivingSide);
  const steps = answers.map((seen, i) => ({
    maneuver: maneuvers[i % maneuvers.length],
    seen,
    scoreAfter: scoreAfterAnswers(startScore, answers.slice(0, i + 1)),
    label: seen ? `⚠ REAPPEARED ×${THRESHOLDS.SDR_ANSWER_FACTOR}` : '✓ NOT SEEN',
  }));
  const finalScore = scoreAfterAnswers(startScore, answers);
  return {
    plate: normalizePlate(plate),
    startScore,
    finalScore,
    verdict: sdrVerdict(finalScore, answers),
    steps,
  };
}

// ---------------------------------------------------------------------------
// RESULT SCREEN — what each verdict shows (Day 14).
// ---------------------------------------------------------------------------
export type SdrAction = 'alertContact' | 'navigatePolice' | 'startRecording' | 'shareLocation' | 'repeatSdr' | 'returnToMap';

export const ACTION_LABELS: Record<SdrAction, string> = {
  alertContact: '🚨 ALERT TRUSTED CONTACT',
  navigatePolice: '🚔 NAVIGATE TO POLICE STATION',
  startRecording: '🎥 START RECORDING',
  shareLocation: '📍 SHARE MY LOCATION',
  repeatSdr: '↻ RUN SDR AGAIN',
  returnToMap: '← RETURN TO MAP',
};

export const VERDICT_UI: Record<
  SdrVerdict,
  { title: string; icon: string; colour: string; message: string; actions: SdrAction[] }
> = {
  confirmed: {
    title: 'TAIL CONFIRMED',
    icon: '🔴',
    colour: COLOURS.dark.red,
    message: 'This vehicle kept reappearing after maneuvers innocent drivers never make.',
    actions: ['alertContact', 'navigatePolice', 'startRecording', 'returnToMap'],
  },
  inconclusive: {
    title: 'INCONCLUSIVE',
    icon: '🟠',
    colour: COLOURS.dark.amber,
    message: 'Not enough evidence either way. Stay on busy roads and keep watching.',
    actions: ['repeatSdr', 'shareLocation', 'returnToMap'],
  },
  clear: {
    title: 'ALL CLEAR',
    icon: '🟢',
    colour: COLOURS.dark.green,
    message: 'The vehicle did not follow your maneuvers. It is cleared for this session.',
    actions: ['returnToMap'],
  },
};
