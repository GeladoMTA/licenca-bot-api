import Database from "better-sqlite3";

export const db = new Database("licenses.db");

db.exec(`
CREATE TABLE IF NOT EXISTS licenses (
  key TEXT PRIMARY KEY,
  expires_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  hwid TEXT,
  bound_at TEXT,
  reset_count INTEGER NOT NULL DEFAULT 0,
  reset_last_at TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS access_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT,
  hwid TEXT,
  ip TEXT,
  action TEXT,
  ok INTEGER,
  error TEXT,
  at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

export function logAccess({ key, hwid, ip, action, ok, error }) {
  db.prepare(
    `INSERT INTO access_logs(key, hwid, ip, action, ok, error)
     VALUES(?,?,?,?,?,?)`
  ).run(key, hwid, ip, action, ok ? 1 : 0, error || null);
}
