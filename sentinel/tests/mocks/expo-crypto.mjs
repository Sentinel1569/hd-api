import { createHash, randomBytes } from 'node:crypto';

export const CryptoDigestAlgorithm = { SHA256: 'SHA-256' };

export async function getRandomBytesAsync(count) {
  return new Uint8Array(randomBytes(count));
}
export async function digestStringAsync(_algorithm, data) {
  return createHash('sha256').update(data).digest('hex');
}
