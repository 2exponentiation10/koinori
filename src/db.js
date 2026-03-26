const fs = require("fs");
const path = require("path");

const Database = require("better-sqlite3");

const dataDir = path.join(__dirname, "..", "data");
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
`);

module.exports = db;
