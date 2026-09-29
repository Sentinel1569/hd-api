// Lets the store and database run under Node for testing: expo-sqlite is
// swapped for Node's built-in SQLite, and the other Expo modules for fakes.
import { register } from 'node:module';

register('./alias-loader.mjs', import.meta.url);
