const fs = require("fs");
const path = require("path");

const Database = require("better-sqlite3");
const { DEFAULT_ROOMS } = require("./config");

const dataDir = process.env.APP_DATA_DIR
  ? path.resolve(process.env.APP_DATA_DIR)
  : path.join(__dirname, "..", "data");
const databasePath = path.join(dataDir, "reservations.db");

fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(databasePath);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    capacity INTEGER,
    description TEXT DEFAULT '',
    image_url TEXT DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_rooms_active_sort
    ON rooms (is_active, sort_order, id);

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

  CREATE TABLE IF NOT EXISTS room_metadata (
    room_id INTEGER PRIMARY KEY,
    capacity INTEGER,
    description TEXT DEFAULT '',
    image_url TEXT DEFAULT '',
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

function ensureColumn(tableName, columnName, definition) {
  const columns = db
    .prepare(`PRAGMA table_info(${tableName})`)
    .all()
    .map((column) => column.name);

  if (columns.includes(columnName)) {
    return;
  }

  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

ensureColumn("rooms", "sort_order", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("rooms", "is_active", "INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))");
ensureColumn("rooms", "capacity", "INTEGER");
ensureColumn("rooms", "description", "TEXT DEFAULT ''");
ensureColumn("rooms", "image_url", "TEXT DEFAULT ''");
ensureColumn("rooms", "created_at", "TEXT DEFAULT ''");
ensureColumn("rooms", "updated_at", "TEXT DEFAULT ''");
ensureColumn("room_metadata", "description", "TEXT DEFAULT ''");
ensureColumn("room_metadata", "image_url", "TEXT DEFAULT ''");

function seedDefaultRooms() {
  const totalRooms = db.prepare("SELECT COUNT(*) FROM rooms").pluck().get();
  const now = new Date().toISOString();

  if (!totalRooms) {
    const insertRoom = db.prepare(
      `
        INSERT INTO rooms (
          id,
          name,
          sort_order,
          is_active,
          capacity,
          description,
          image_url,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)
      `,
    );

    DEFAULT_ROOMS.forEach((room, index) => {
      insertRoom.run(
        room.id,
        room.name,
        index,
        room.defaultCapacity ?? null,
        room.defaultDescription || "",
        room.defaultImageUrl || "",
        now,
        now,
      );
    });
    return;
  }

  const insertFallbackRoom = db.prepare(
    `
      INSERT INTO rooms (
        id,
        name,
        sort_order,
        is_active,
        capacity,
        description,
        image_url,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)
    `,
  );

  const existingIds = new Set(
    db.prepare("SELECT id FROM rooms").all().map((row) => row.id),
  );

  DEFAULT_ROOMS.forEach((room, index) => {
    if (existingIds.has(room.id)) {
      return;
    }

    insertFallbackRoom.run(
      room.id,
      room.name,
      index,
      room.defaultCapacity ?? null,
      room.defaultDescription || "",
      room.defaultImageUrl || "",
      now,
      now,
    );
  });
}

function migrateLegacyRoomMetadata() {
  const legacyRows = db
    .prepare(
      `
        SELECT room_id, capacity, description, image_url
        FROM room_metadata
      `,
    )
    .all();

  if (!legacyRows.length) {
    return;
  }

  const updateRoom = db.prepare(
    `
      UPDATE rooms
      SET capacity = COALESCE(?, capacity),
          description = CASE
            WHEN TRIM(COALESCE(?, '')) = '' THEN description
            ELSE ?
          END,
          image_url = CASE
            WHEN TRIM(COALESCE(?, '')) = '' THEN image_url
            ELSE ?
          END,
          updated_at = ?
      WHERE id = ?
    `,
  );
  const now = new Date().toISOString();

  legacyRows.forEach((row) => {
    updateRoom.run(
      row.capacity ?? null,
      row.description || "",
      row.description || "",
      row.image_url || "",
      row.image_url || "",
      now,
      row.room_id,
    );
  });
}

seedDefaultRooms();
migrateLegacyRoomMetadata();

module.exports = {
  db,
  dataDir,
  databasePath,
};
