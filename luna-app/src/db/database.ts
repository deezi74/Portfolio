import * as SQLite from 'expo-sqlite';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * Single shared SQLite connection for Luna's knowledge store. All memory —
 * graph nodes/edges, conversation turns, saved API keys' metadata (never the
 * keys themselves, those live in SecureStore) — lives in one local file on
 * device. Nothing leaves the phone unless a cloud provider or web tool is
 * explicitly invoked.
 */
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = openAndMigrate();
  }
  return dbPromise;
}

async function openAndMigrate(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync('luna.db');
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS nodes (
      id TEXT PRIMARY KEY NOT NULL,
      label TEXT NOT NULL,
      category TEXT NOT NULL,
      summary TEXT,
      source TEXT,
      importance REAL NOT NULL DEFAULT 0.4,
      connections INTEGER NOT NULL DEFAULT 0,
      lastUpdated INTEGER NOT NULL,
      x REAL,
      y REAL,
      pinned INTEGER NOT NULL DEFAULT 0,
      ephemeralWeb INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS edges (
      id TEXT PRIMARY KEY NOT NULL,
      source TEXT NOT NULL,
      target TEXT NOT NULL,
      strength REAL NOT NULL DEFAULT 0.5,
      FOREIGN KEY (source) REFERENCES nodes(id) ON DELETE CASCADE,
      FOREIGN KEY (target) REFERENCES nodes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      relatedNodeIds TEXT
    );

    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      nodeId TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source);
    CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target);
    CREATE INDEX IF NOT EXISTS idx_conversations_created ON conversations(createdAt);
  `);
  return db;
}
