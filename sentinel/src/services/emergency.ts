/**
 * Emergency actions for the SDR Result screen buttons, which have no build day
 * in the plan.
 *
 * Install: npx expo install expo-sms
 *
 * A phone app cannot send an SMS by itself: sendSMSAsync opens the messaging
 * app with the alert typed in, and you tap Send. Fully automatic alerts, and
 * the dead man's switch, need a server with an SMS gateway.
 */
import * as SMS from 'expo-sms';
import { Linking } from 'react-native';
import type { LatLng } from '../engine/geo';
import { formatPlate } from '../engine/patternDetection';

export function mapsLink({ latitude, longitude }: LatLng): string {
  return `https://maps.google.com/?q=${latitude.toFixed(5)},${longitude.toFixed(5)}`;
}

export function buildAlertMessage(opts: { plate: string; score: number; location: LatLng | null; at?: Date }): string {
  const at = opts.at ?? new Date();
  const time = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
  const where = opts.location ? mapsLink(opts.location) : 'location unavailable';
  return (
    `SENTINEL ALERT: I think vehicle ${formatPlate(opts.plate)} is following me ` +
    `(threat ${opts.score.toFixed(1)}/10). My location at ${time}: ${where} ` +
    `Please call me. If I don't answer, call the police.`
  );
}

/** "0803 123 4567" → "2348031234567". Defaults to Nigeria (+234). */
export function toInternational(phone: string, countryCode = '234'): string {
  const digits = phone.replace(/\D/g, '');
  if (phone.trim().startsWith('+') || digits.startsWith(countryCode)) return digits;
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith('0')) return countryCode + digits.slice(1);
  return countryCode + digits;
}

/** Opens the SMS app with the alert ready for every contact. false = no SMS on this device. */
export async function alertContactsBySms(phoneNumbers: string[], message: string): Promise<boolean> {
  if (phoneNumbers.length === 0 || !(await SMS.isAvailableAsync())) return false;
  await SMS.sendSMSAsync(phoneNumbers, message);
  return true;
}

/** Opens a WhatsApp chat with the alert typed in. */
export async function alertViaWhatsApp(phone: string, message: string, countryCode = '234'): Promise<boolean> {
  const url = `https://wa.me/${toInternational(phone, countryCode)}?text=${encodeURIComponent(message)}`;
  return Linking.openURL(url).then(
    () => true,
    () => false,
  );
}

/** Opens Google Maps searching for police stations near you. Needs a data connection. */
export async function navigateToPoliceStation(): Promise<boolean> {
  return Linking.openURL('https://www.google.com/maps/search/?api=1&query=police%20station').then(
    () => true,
    () => false,
  );
}
