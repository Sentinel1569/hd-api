/**
 * App lock (Day 19).
 *
 * The Build Companion says to set up a PIN with expo-local-authentication, but
 * that library can only ask for the phone's OWN fingerprint, face or passcode —
 * it cannot create a SENTINEL PIN. So the PIN lives here: a salted SHA-256 hash
 * in SecureStore (the PIN itself is never stored), locked for 5 minutes after
 * 5 wrong tries.
 *
 * Install: npx expo install expo-secure-store expo-crypto expo-local-authentication expo-screen-capture
 *
 * In Expo Go on an iPhone, Face ID falls back to the phone passcode. It works
 * properly in a development build with, in app.json:
 *   "plugins": [["expo-local-authentication", { "faceIDPermission": "Unlock SENTINEL with Face ID" }]]
 */
import * as Crypto from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';
import * as ScreenCapture from 'expo-screen-capture';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const PIN_HASH = 'sentinel.pin.hash';
const PIN_SALT = 'sentinel.pin.salt';
const PIN_FAILS = 'sentinel.pin.fails';
const PIN_LOCKED_UNTIL = 'sentinel.pin.lockedUntil';
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60_000;

export type PinCheck = 'ok' | 'wrong' | 'locked';

const hashPin = (salt: string, pin: string) =>
  Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);

export async function hasPin(): Promise<boolean> {
  return (await SecureStore.getItemAsync(PIN_HASH)) !== null;
}

export async function setPin(pin: string): Promise<void> {
  if (!/^\d{4,8}$/.test(pin)) throw new Error('The PIN must be 4 to 8 digits.');
  const bytes = await Crypto.getRandomBytesAsync(16);
  const salt = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  await SecureStore.setItemAsync(PIN_SALT, salt);
  await SecureStore.setItemAsync(PIN_HASH, await hashPin(salt, pin));
  await SecureStore.deleteItemAsync(PIN_FAILS);
  await SecureStore.deleteItemAsync(PIN_LOCKED_UNTIL);
}

export async function verifyPin(pin: string): Promise<PinCheck> {
  const lockedUntil = Number((await SecureStore.getItemAsync(PIN_LOCKED_UNTIL)) ?? 0);
  if (Date.now() < lockedUntil) return 'locked';

  const [salt, hash] = await Promise.all([SecureStore.getItemAsync(PIN_SALT), SecureStore.getItemAsync(PIN_HASH)]);
  if (salt && hash && (await hashPin(salt, pin)) === hash) {
    await SecureStore.deleteItemAsync(PIN_FAILS);
    return 'ok';
  }

  const fails = Number((await SecureStore.getItemAsync(PIN_FAILS)) ?? 0) + 1;
  if (fails >= MAX_ATTEMPTS) {
    await SecureStore.setItemAsync(PIN_LOCKED_UNTIL, String(Date.now() + LOCKOUT_MS));
    await SecureStore.deleteItemAsync(PIN_FAILS);
    return 'locked';
  }
  await SecureStore.setItemAsync(PIN_FAILS, String(fails));
  return 'wrong';
}

/** Fingerprint or face unlock, with the phone passcode as fallback. */
export async function unlockWithBiometrics(): Promise<boolean> {
  const [hasHardware, isEnrolled] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
  ]);
  if (!hasHardware || !isEnrolled) return false;
  const result = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock SENTINEL' });
  return result.success;
}

/**
 * Day 19's "blur when the app goes to the background": hides SENTINEL in the
 * app switcher and blocks screenshots. Call once at start-up. Before taking the
 * Week 8 pitch-deck screenshots, call ScreenCapture.allowScreenCaptureAsync().
 */
export async function enablePrivacyScreen(): Promise<void> {
  await ScreenCapture.preventScreenCaptureAsync(); // Android: blank preview in recent apps
  if (Platform.OS === 'ios') await ScreenCapture.enableAppSwitcherProtectionAsync(0.9);
}
