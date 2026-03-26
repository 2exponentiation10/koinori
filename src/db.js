const fs = require("fs");
const path = require("path");

const Database = require("better-sqlite3");

const dataDir = process.env.APP_DATA_DIR
  ? path.resolve(process.env.APP_DATA_DIR)
  : path.join(__dirname, "..", "data");
const databasePath = path.join(dataDir, "reservations.db");

fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(databasePath);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reservation_date TEXT NOT NULL,
    slot_id INTEGER NOT NULL,
    room_id INTEGER,
    community_name TEXT NOT NULL,
    requester_name TEXT NOT NULL,
    attendees INTEGER NOT NULL,
    contact TEXT DEFAULT '',
    note TEXT DEFAULT '',
    status TEXT NOT NULL CHECK (status IN ('confirmed', 'waitlisted', 'cancelled')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_reservations_date_slot_status
    ON reservations (reservation_date, slot_id, status);

  CREATE UNIQUE INDEX IF NOT EXISTS idx_confirmed_room_slot
    ON reservations (reservation_date, slot_id, room_id)
    WHERE status = 'confirmed' AND room_id IS NOT NULL;

  CREATE TABLE IF NOT EXISTS room_slot_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reservation_date TEXT NOT NULL,
    room_id INTEGER NOT NULL,
    slot_id INTEGER NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('available', 'fixed', 'closed')),
    label TEXT DEFAULT '',
    updated_at TEXT NOT NULL,
    UNIQUE (reservation_date, room_id, slot_id)
  );

  CREATE INDEX IF NOT EXISTS idx_room_slot_settings_date_slot
    ON room_slot_settings (reservation_date, slot_id);
`);

module.exports = db;
