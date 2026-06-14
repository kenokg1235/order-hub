// ─────────────────────────────────────────────────────────────────────────────
// SQLite database — single source of truth for Order Hub.
// Full schema baked in up front; a lightweight migration block adds columns to
// pre-existing DBs so we never lose data between phases.
// ─────────────────────────────────────────────────────────────────────────────
import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import path from "path";
import bcrypt from "bcryptjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, "data.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  email        TEXT NOT NULL UNIQUE,
  password     TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT 'Member',   -- Admin | Leader | Member | Lister
  team_ids     TEXT NOT NULL DEFAULT '[]',
  store_names  TEXT NOT NULL DEFAULT '[]',        -- stores a Lister/Member may see
  can_buy_card INTEGER NOT NULL DEFAULT 0,
  active       INTEGER NOT NULL DEFAULT 1,
  created_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS stores (
  name TEXT PRIMARY KEY, created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY, value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id            TEXT PRIMARY KEY,        -- eBay "ID Order" (Order Number)
  team          TEXT DEFAULT '',
  store         TEXT DEFAULT '',
  address       TEXT DEFAULT '',
  cust_phone    TEXT DEFAULT '',
  qty           TEXT DEFAULT '',
  product       TEXT DEFAULT '',
  image         TEXT DEFAULT '',
  link          TEXT DEFAULT '',
  size          TEXT DEFAULT '',
  color         TEXT DEFAULT '',
  profit        REAL DEFAULT 0,
  deadline      TEXT DEFAULT '',
  master_status TEXT DEFAULT '',
  claimed_by    TEXT DEFAULT '',
  claimed_name  TEXT DEFAULT '',
  claimed_at    INTEGER DEFAULT 0,
  note1 TEXT DEFAULT '', note2 TEXT DEFAULT '', note3 TEXT DEFAULT '', note4 TEXT DEFAULT '',
  listed_by     TEXT DEFAULT '',         -- user id who imported/created the order
  raw           TEXT DEFAULT '{}',
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS purchases (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  card TEXT DEFAULT '', amount REAL DEFAULT 0,
  order_number TEXT DEFAULT '', email TEXT DEFAULT '', tracking TEXT DEFAULT '',
  phone TEXT DEFAULT '', zip TEXT DEFAULT '', process_status TEXT DEFAULT '',
  created_at INTEGER NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS card_requests (
  id TEXT PRIMARY KEY,
  requester_id TEXT NOT NULL, requester_name TEXT NOT NULL,
  content TEXT DEFAULT '', card_value TEXT DEFAULT '', status TEXT DEFAULT '',
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, type TEXT NOT NULL,
  message TEXT NOT NULL, link TEXT DEFAULT '', read INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_purchases_order ON purchases(order_id);
CREATE INDEX IF NOT EXISTS idx_purchases_card  ON purchases(card);
CREATE INDEX IF NOT EXISTS idx_orders_team     ON orders(team);
CREATE INDEX IF NOT EXISTS idx_orders_store    ON orders(store);
CREATE INDEX IF NOT EXISTS idx_notif_user      ON notifications(user_id);
`);

// ── Migrations for pre-existing DBs (add columns if missing) ─────────────────
function ensureColumn(table, col, decl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${decl}`);
}
ensureColumn("users", "store_names", "TEXT NOT NULL DEFAULT '[]'");
ensureColumn("orders", "listed_by", "TEXT DEFAULT ''");
ensureColumn("orders", "master_note", "TEXT DEFAULT ''");   // Admin/Lister note on Sheet Tổng
ensureColumn("users", "telegram_chat_id", "TEXT DEFAULT ''");
ensureColumn("orders", "overdue_notified", "INTEGER DEFAULT 0");
ensureColumn("orders", "period", "TEXT DEFAULT ''");   // working month "YYYY-MM"
ensureColumn("purchases", "order_time", "INTEGER DEFAULT 0");   // when Order# last changed
ensureColumn("shipments", "account", "TEXT DEFAULT ''");        // which AfterShip key registered it
ensureColumn("card_requests", "seq", "INTEGER DEFAULT 0");      // human-readable running ID
ensureColumn("card_requests", "period", "TEXT DEFAULT ''");    // month the card was first used "YYYY-MM"
// Backfill running IDs for card requests that don't have one yet.
{
  const todo = db.prepare("SELECT id FROM card_requests WHERE seq IS NULL OR seq=0 ORDER BY created_at").all();
  let next = (db.prepare("SELECT COALESCE(MAX(seq),0) m FROM card_requests").get().m) + 1;
  const up = db.prepare("UPDATE card_requests SET seq=? WHERE id=?");
  for (const r of todo) up.run(next++, r.id);
}

// Shipment tracking status (from AfterShip), keyed by tracking number.
db.exec(`
CREATE TABLE IF NOT EXISTS shipments (
  tracking_number TEXT PRIMARY KEY,
  slug       TEXT DEFAULT '',
  tag        TEXT DEFAULT '',      -- AfterShip status tag
  message    TEXT DEFAULT '',      -- last checkpoint message
  checked_at INTEGER DEFAULT 0,
  registered INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);
`);

// Payouts entered by Listing per eBay account (store).
db.exec(`
CREATE TABLE IF NOT EXISTS payouts (
  id         TEXT PRIMARY KEY,
  store      TEXT DEFAULT '',
  username   TEXT DEFAULT '',
  bank       TEXT DEFAULT '',
  amount     REAL DEFAULT 0,
  date       TEXT DEFAULT '',
  bank_name  TEXT DEFAULT '',
  note       TEXT DEFAULT '',
  created_by TEXT DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payouts_store ON payouts(store);
`);

// ── Seed defaults ────────────────────────────────────────────────────────────
function seedSetting(key, value) {
  if (!db.prepare("SELECT 1 FROM settings WHERE key=?").get(key))
    db.prepare("INSERT INTO settings (key,value) VALUES (?,?)").run(key, JSON.stringify(value));
}
seedSetting("masterStatuses",  ["Đã Up", "Đã Cancel"]);
seedSetting("processStatuses", ["Đã xử lý", "Ped", "Có Tracking"]);
seedSetting("cardStatuses",    ["Chờ cấp", "Đã cấp", "Đã nhận", "Đã dùng", "Lỗi thẻ"]);
// Card statuses that count toward Leaderboard "số thẻ".
seedSetting("cardCountStatuses", ["Live Bill", "Sai bill"]);
seedSetting("aftership", { enabled: false, keys: [] });   // keys: [apiKey, ...] (mỗi key ~50/tháng)
seedSetting("telegram",        { botToken: "", enabled: false });
// Active working month (new imports land here; "Chốt tháng" advances it).
const _d = new Date();
seedSetting("activeMonth", `${_d.getFullYear()}-${String(_d.getMonth() + 1).padStart(2, "0")}`);
// Backfill orders that predate the period column → put them in the active month.
{
  const am = JSON.parse(db.prepare("SELECT value FROM settings WHERE key='activeMonth'").get().value);
  db.prepare("UPDATE orders SET period=? WHERE period='' OR period IS NULL").run(am);
}
// Row highlight colors (status name → light background). Master priority over process.
seedSetting("statusColors", {
  "Đã Up": "#e6f7ec", "Đã Cancel": "#fdeaea",
  "Đã xử lý": "#e8f0fe", "Ped": "#fef3e2", "Có Tracking": "#e6f7f4",
});

if (db.prepare("SELECT COUNT(*) c FROM teams").get().c === 0) {
  const now = Date.now();
  const ins = db.prepare("INSERT INTO teams (id,name,created_at) VALUES (?,?,?)");
  ins.run("team-tin", "Tín", now);
  ins.run("team-v3",  "V3",  now);
}

if (db.prepare("SELECT COUNT(*) c FROM users").get().c === 0) {
  db.prepare(`INSERT INTO users (id,name,email,password,role,team_ids,store_names,can_buy_card,active,created_at)
              VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run("u-admin", "Admin", "admin@orderhub.local",
         bcrypt.hashSync("admin123", 10), "Admin", "[]", "[]", 1, 1, Date.now());
  console.log("[db] Seeded admin → admin@orderhub.local / admin123");
}

export default db;
