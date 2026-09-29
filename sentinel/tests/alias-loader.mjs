const ALIASES = {
  'expo-sqlite': './mocks/expo-sqlite.mjs',
  'expo-secure-store': './mocks/expo-secure-store.mjs',
  'expo-crypto': './mocks/expo-crypto.mjs',
  'expo-local-authentication': './mocks/expo-local-authentication.mjs',
  'expo-screen-capture': './mocks/expo-screen-capture.mjs',
  'expo-sms': './mocks/expo-sms.mjs',
  'react-native': './mocks/react-native.mjs',
};

export async function resolve(specifier, context, nextResolve) {
  if (specifier in ALIASES) {
    return { url: new URL(ALIASES[specifier], import.meta.url).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
