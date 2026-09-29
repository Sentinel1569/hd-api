// The subset of expo-sqlite that src/db/database.ts uses, backed by node:sqlite.
// Databases are files in SENTINEL_TEST_DB_DIR so a second process can reopen them.
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const bindings = (params) => (params.length === 1 && Array.isArray(params[0]) ? params[0] : params);

class NodeSQLiteDatabase {
  constructor(file) {
    this.db = new DatabaseSync(file);
  }
  async execAsync(source) {
    this.db.exec(source);
  }
  async runAsync(source, ...params) {
    const result = this.db.prepare(source).run(...bindings(params));
    return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
  }
  async getFirstAsync(source, ...params) {
    return this.db.prepare(source).get(...bindings(params)) ?? null;
  }
  async getAllAsync(source, ...params) {
    return this.db.prepare(source).all(...bindings(params));
  }
  async closeAsync() {
    this.db.close();
  }
}

const pathFor = (name) => join(process.env.SENTINEL_TEST_DB_DIR, name);

export async function openDatabaseAsync(name) {
  return new NodeSQLiteDatabase(pathFor(name));
}

export async function deleteDatabaseAsync(name) {
  rmSync(pathFor(name));
}
