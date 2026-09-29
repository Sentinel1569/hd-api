export const sentMessages = [];

export async function isAvailableAsync() {
  return true;
}
export async function sendSMSAsync(addresses, message) {
  sentMessages.push({ addresses, message });
  return { result: 'unknown' };
}
